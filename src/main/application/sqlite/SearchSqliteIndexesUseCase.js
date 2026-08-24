import {
  INDEXABLE_FIELDS,
  SEARCH_STREAM_CHUNK_SIZE,
  SQLITE_INDEX_FORMAT_VERSION,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";

export class SearchSqliteIndexesUseCase {
  constructor({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    termService,
    indexStore,
    maxResults,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.termService = termService;
    this.indexStore = indexStore;
    this.maxResults = maxResults;
    this.currentSearchToken = null;
  }

  async execute(payload, options = {}) {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    await this.localDatabaseService.ensureReady(rootPath);
    const paths = new LocalDatabasePaths(rootPath);
    const state = await this.stateRepository.readSqliteIndexState(paths);
    if (!state ||
      state.formatVersion !== SQLITE_INDEX_FORMAT_VERSION ||
      !["running", "cancelled", "completed"].includes(state.status)) {
      throw new Error("SQLite indexes have not been built yet.");
    }

    const queries = Object.entries(payload || {})
      .filter(([field, value]) => INDEXABLE_FIELDS.includes(field) && value)
      .map(([field, value]) => ({ field, term: this.termService.buildQueryTerm(field, value) }))
      .filter((query) => query.term);
    if (queries.length === 0) return [];

    const searchToken = { cancelled: false };
    this.currentSearchToken = searchToken;
    try {
      const candidateLimit = Math.min(Math.max(this.maxResults * 100, 10000), 100000);
      const wildcardReady = state.wildcard?.status === "completed" &&
        state.wildcard?.indexedDocuments === state.indexedDocuments;
      const matches = queries.map(({ field, term }) =>
        this.indexStore.queryField(field, term, candidateLimit, { wildcardReady })
      );
      matches.sort((left, right) => left.length - right.length);
      const docKeys = this.intersect(matches).slice(0, this.maxResults);
      if (searchToken.cancelled || docKeys.length === 0) return [];

      const pointers = this.indexStore.loadDocumentPointers(docKeys);
      const documents = await this.loadDocuments(paths, pointers, searchToken);
      const sources = await this.stateRepository.readSources(paths);
      const sourceMetaMap = new Map(sources.map((source) => [source.sourceTable, source]));
      return await this.buildResults(documents, sourceMetaMap, searchToken, options);
    } finally {
      if (this.currentSearchToken === searchToken) this.currentSearchToken = null;
    }
  }

  cancel() {
    if (this.currentSearchToken) this.currentSearchToken.cancelled = true;
  }

  intersect(matches) {
    if (matches.length === 0) return [];
    if (matches.length === 1) return matches[0];
    const otherSets = matches.slice(1).map((values) =>
      new Set(values.map((value) => Buffer.from(value).toString("hex")))
    );
    return matches[0].filter((value) =>
      otherSets.every((set) => set.has(Buffer.from(value).toString("hex")))
    );
  }

  async loadDocuments(paths, pointers, searchToken) {
    const byFile = new Map();
    for (const pointer of pointers) {
      const entries = byFile.get(pointer.file_name) || [];
      entries.push(pointer);
      byFile.set(pointer.file_name, entries);
    }
    const documentsById = new Map();
    for (const [fileName, entries] of byFile.entries()) {
      if (searchToken.cancelled) return [];
      try {
        const rawDocuments = await this.jsonLinesRepository.readChunks(
          paths.getDocumentPath(fileName),
          entries.map((entry) => ({
            byteOffset: entry.byte_offset,
            byteLength: entry.byte_length,
          }))
        );
        for (let index = 0; index < entries.length; index += 1) {
          documentsById.set(entries[index].doc_id, JSON.parse(rawDocuments[index]));
        }
      } catch {
        continue;
      }
    }
    return pointers.map((pointer) => documentsById.get(pointer.doc_id)).filter(Boolean);
  }

  async buildResults(documents, sourceMetaMap, searchToken, options) {
    const results = [];
    const seenSources = new Set();
    const streaming = typeof options.onChunk === "function";
    let chunk = [];
    let totalResults = 0;
    const flush = async () => {
      if (chunk.length === 0) return;
      if (streaming) await options.onChunk(chunk);
      else results.push(...chunk);
      totalResults += chunk.length;
      chunk = [];
    };

    for (const document of documents) {
      if (searchToken.cancelled) return [];
      if (!seenSources.has(document.sourceTable)) {
        const sourceMeta = sourceMetaMap.get(document.sourceTable);
        chunk.push({ object_data_base: {
          name_table: document.sourceTable,
          name: sourceMeta?.name || document.sourceTable,
          info: sourceMeta?.description ||
            (sourceMeta?.fileName
              ? localDbMessages.searchBaseInfo(sourceMeta.fileName)
              : localDbMessages.localSourceInfo),
          type: sourceMeta?.type || "local-import",
          type_sources: sourceMeta?.type || "local-import",
        } });
        seenSources.add(document.sourceTable);
      }
      chunk.push({ object_data: {
        source_name: document.sourceTable,
        fields: { ...document.fields, ...document.invalidFields },
      } });
      if (chunk.length >= SEARCH_STREAM_CHUNK_SIZE) await flush();
    }
    await flush();
    return streaming
      ? { totalResults, matchedDocuments: documents.length, matchedSources: seenSources.size }
      : results;
  }
}
