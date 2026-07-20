import { INDEXABLE_FIELDS, MAX_RESULTS } from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";

export class SearchLocalDatabaseUseCase {
  constructor({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    termService,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.termService = termService;
    this.currentSearchToken = null;
  }

  async execute(payload) {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) {
      throw new Error(localDbMessages.databaseNotInitialized);
    }

    await this.localDatabaseService.ensureReady(rootPath);

    const searchToken = { cancelled: false };
    this.currentSearchToken = searchToken;

    try {
      const queryEntries = Object.entries(payload || {})
        .filter(([field, value]) => INDEXABLE_FIELDS.includes(field) && value)
        .map(([field, value]) => ({
          field,
          term: this.termService.buildQueryTerm(field, value),
        }))
        .filter((entry) => entry.term);

      if (queryEntries.length === 0) {
        return [];
      }

      const paths = new LocalDatabasePaths(rootPath);
      const docIdSets = [];

      for (const queryEntry of queryEntries) {
        if (searchToken.cancelled) return [];
        const docIds = await this.findDocIdsByTerm(
          paths,
          queryEntry.field,
          queryEntry.term,
          searchToken
        );
        docIdSets.push(docIds);
      }

      if (searchToken.cancelled) return [];

      const matchedDocIds = this.intersectDocIdSets(docIdSets).slice(0, MAX_RESULTS);
      if (matchedDocIds.length === 0) {
        return [];
      }

      const documents = await this.loadDocumentsByIds(paths, matchedDocIds, searchToken);
      const sourceMetaMap = await this.loadSourceMeta(paths);

      if (searchToken.cancelled) return [];

      const results = [];
      const seenSources = new Set();

      for (const document of documents) {
        if (searchToken.cancelled) return [];

        if (!seenSources.has(document.sourceTable)) {
          const sourceMeta = sourceMetaMap.get(document.sourceTable);
          results.push({
            object_data_base: {
              name_table: document.sourceTable,
              name: document.sourceTable,
              info: sourceMeta
                ? localDbMessages.searchBaseInfo(sourceMeta.fileName)
                : localDbMessages.localSourceInfo,
              type: "local-import",
            },
          });
          seenSources.add(document.sourceTable);
        }

        results.push({
          object_data: {
            source_name: document.sourceTable,
            fields: {
              ...document.fields,
              ...document.invalidFields,
            },
          },
        });
      }

      return results;
    } finally {
      if (this.currentSearchToken === searchToken) {
        this.currentSearchToken = null;
      }
    }
  }

  cancel() {
    if (this.currentSearchToken) {
      this.currentSearchToken.cancelled = true;
    }
  }

  async findDocIdsByTerm(paths, field, term, searchToken) {
    if (this.termService.hasWildcards(term)) {
      return await this.findDocIdsByWildcard(paths, field, term, searchToken);
    }

    const bucketPath = paths.getIndexBucketPath(field, this.termService.getBucketName(term));
    const matches = [];

    try {
      for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
        if (searchToken.cancelled) return [];
        if (entry.term === term) {
          matches.push(entry.docId);
          if (matches.length >= MAX_RESULTS) break;
        }
      }
    } catch {
      return [];
    }

    return matches;
  }

  async findDocIdsByWildcard(paths, field, term, searchToken) {
    const bucketFiles = await this.resolveWildcardBuckets(paths, field, term);
    if (bucketFiles.length === 0) return [];

    const regex = this.termService.buildWildcardRegex(term);
    const matches = new Set();

    for (const bucketPath of bucketFiles) {
      try {
        for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
          if (searchToken.cancelled) return [];
          if (regex.test(entry.term)) {
            matches.add(entry.docId);
            if (matches.size >= MAX_RESULTS) break;
          }
        }
      } catch {
        continue;
      }

      if (matches.size >= MAX_RESULTS) break;
    }

    return [...matches];
  }

  async resolveWildcardBuckets(paths, field, term) {
    try {
      const prefix = this.termService.getWildcardPrefix(term);
      if (prefix) {
        return [paths.getIndexBucketPath(field, this.termService.getBucketName(prefix))];
      }

      const fileNames = await this.jsonLinesRepository.listFiles(
        paths.getIndexFieldDir(field),
        ".jsonl"
      );
      return fileNames.map((fileName) => paths.getIndexBucketPath(field, fileName.slice(0, -6)));
    } catch {
      return [];
    }
  }

  intersectDocIdSets(docIdSets) {
    if (docIdSets.length === 0) return [];
    if (docIdSets.length === 1) return [...new Set(docIdSets[0])];

    const [firstSet, ...restSets] = docIdSets.map((set) => new Set(set));
    return [...firstSet].filter((docId) => restSets.every((set) => set.has(docId)));
  }

  async loadDocumentsByIds(paths, docIds, searchToken) {
    const targetDocIds = new Set(docIds);
    const documents = [];
    const bucketMap = new Map();

    for (const docId of docIds) {
      const bucket = this.termService.getDocumentBucketName(docId);
      const bucketDocIds = bucketMap.get(bucket) || [];
      bucketDocIds.push(docId);
      bucketMap.set(bucket, bucketDocIds);
    }

    for (const [bucket, bucketDocIds] of bucketMap.entries()) {
      const bucketPath = paths.getDocumentLookupBucketPath(bucket);
      const bucketSet = new Set(bucketDocIds);

      try {
        for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
          if (searchToken.cancelled) return [];
          if (bucketSet.has(entry.docId) && targetDocIds.has(entry.docId)) {
            documents.push(entry);
            targetDocIds.delete(entry.docId);
            if (targetDocIds.size === 0) break;
          }
        }
      } catch {
        continue;
      }

      if (targetDocIds.size === 0) break;
    }

    return documents;
  }

  async loadSourceMeta(paths) {
    const sources = await this.stateRepository.readSources(paths);
    return new Map(sources.map((source) => [source.sourceTable, source]));
  }
}
