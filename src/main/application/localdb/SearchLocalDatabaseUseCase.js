import path from "path";
import { performance } from "node:perf_hooks";
import {
  INDEXABLE_FIELDS,
  LEGACY_INDEX_BUCKET_LAYOUT_VERSION,
  SEARCH_STREAM_CHUNK_SIZE,
} from "../../localdb/constants.js";
import {
  getBucketLayout,
  normalizeBucketLayoutMap,
} from "../../localdb/indexBucketLayouts.js";
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

  async execute(payload, options = {}) {
    const profile = this.createProfile(options);
    const executeStartedAt = performance.now();
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) {
      throw new Error(localDbMessages.databaseNotInitialized);
    }

    await this.measureStep(profile, "ensureReadyMs", async () => {
      await this.localDatabaseService.ensureReady(rootPath);
    });

    const searchToken = { cancelled: false };
    this.currentSearchToken = searchToken;

    try {
      const queryEntries = Object.entries(payload || {})
        .filter(([field, value]) => INDEXABLE_FIELDS.includes(field) && value)
        .map(([field, value]) => ({
          field,
          term: this.termService.buildQueryTerm(field, value),
          bucketLayoutVersion: LEGACY_INDEX_BUCKET_LAYOUT_VERSION,
        }))
        .filter((entry) => entry.term);

      if (queryEntries.length === 0) {
        return [];
      }

      const paths = new LocalDatabasePaths(rootPath);
      const bucketLayoutVersions = await this.measureStep(profile, "loadMetaMs", async () => {
        const [meta, indexState] = await Promise.all([
          this.stateRepository.readJson(paths.databaseMetaPath, null),
          this.stateRepository.readIndexState(paths),
        ]);

        if (indexState?.status === "running" && indexState?.bucketLayouts) {
          return normalizeBucketLayoutMap({
            bucketLayoutVersion: indexState.bucketLayoutVersion,
            bucketLayouts: indexState.bucketLayouts,
          });
        }

        return normalizeBucketLayoutMap(meta?.indexes || {});
      });
      const bucketStats = await this.measureStep(profile, "loadBucketStatsMs", async () => {
        return await this.stateRepository.readIndexBucketStats(paths);
      });

      for (const queryEntry of queryEntries) {
        queryEntry.bucketLayoutVersion =
          bucketLayoutVersions[queryEntry.field] || LEGACY_INDEX_BUCKET_LAYOUT_VERSION;
        queryEntry.estimatedBucketEntries = this.estimateBucketEntries(queryEntry, bucketStats);
      }

      queryEntries.sort((left, right) => {
        return left.estimatedBucketEntries - right.estimatedBucketEntries;
      });

      const docIdSets = [];

      for (const queryEntry of queryEntries) {
        if (searchToken.cancelled) return [];
        const docIds = await this.measureFieldLookup(profile, queryEntry, async () =>
          await this.findDocIdsByTerm(
            paths,
            queryEntry.field,
            queryEntry.term,
            searchToken,
            profile,
            queryEntry.bucketLayoutVersion
          )
        );
        docIdSets.push(docIds);
      }

      if (searchToken.cancelled) return [];

      const matchedDocIds = await this.measureStep(profile, "intersectMs", async () =>
        this.intersectDocIdSets(docIdSets)
      );
      if (profile) {
        profile.matchedDocIds = matchedDocIds.length;
      }
      if (matchedDocIds.length === 0) {
        if (profile) {
          profile.totalMs = performance.now() - executeStartedAt;
        }
        return [];
      }

      const documents = await this.measureStep(profile, "loadDocumentsMs", async () =>
        await this.loadDocumentsByIds(paths, matchedDocIds, searchToken, profile)
      );
      if (profile) {
        profile.loadedDocuments = documents.length;
      }
      const sourceMetaMap = await this.measureStep(profile, "loadSourceMetaMs", async () =>
        await this.loadSourceMeta(paths)
      );

      if (searchToken.cancelled) return [];

      const results = [];
      const seenSources = new Set();
      const useStreaming = typeof options.onChunk === "function";
      let chunkBuffer = [];
      let totalResults = 0;

      const flushChunk = async () => {
        if (chunkBuffer.length === 0) return;

        if (useStreaming) {
          await options.onChunk(chunkBuffer);
        } else {
          results.push(...chunkBuffer);
        }

        totalResults += chunkBuffer.length;
        chunkBuffer = [];
      };

      const buildResultsStartedAt = performance.now();
      for (const document of documents) {
        if (searchToken.cancelled) return [];

        if (!seenSources.has(document.sourceTable)) {
          const sourceMeta = sourceMetaMap.get(document.sourceTable);
          chunkBuffer.push({
            object_data_base: this.mapSourceResult(document.sourceTable, sourceMeta),
          });
          seenSources.add(document.sourceTable);
        }

        chunkBuffer.push({
          object_data: {
            source_name: document.sourceTable,
            fields: {
              ...document.fields,
              ...document.invalidFields,
            },
          },
        });

        if (chunkBuffer.length >= SEARCH_STREAM_CHUNK_SIZE) {
          await flushChunk();
        }
      }

      await flushChunk();
      if (profile) {
        profile.buildResultsMs = performance.now() - buildResultsStartedAt;
        profile.totalMs = performance.now() - executeStartedAt;
      }

      return useStreaming
        ? {
            totalResults,
            matchedDocuments: documents.length,
            matchedSources: seenSources.size,
          }
        : results;
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

  createProfile(options) {
    if (!options?.profile) return null;

    return Object.assign(options.profile, {
      queryFields: [],
      lookupBuckets: [],
      wildcardBuckets: [],
    });
  }

  async measureStep(profile, key, callback) {
    if (!profile) {
      return await callback();
    }

    const startedAt = performance.now();
    const result = await callback();
    profile[key] = (profile[key] || 0) + (performance.now() - startedAt);
    return result;
  }

  async measureFieldLookup(profile, queryEntry, callback) {
    if (!profile) {
      return await callback();
    }

    const startedAt = performance.now();
    const result = await callback();
    profile.queryFields.push({
      field: queryEntry.field,
      term: queryEntry.term,
      bucketLayoutVersion: queryEntry.bucketLayoutVersion,
      estimatedBucketEntries: queryEntry.estimatedBucketEntries,
      matchedDocIds: result.length,
      durationMs: performance.now() - startedAt,
    });
    return result;
  }

  async findDocIdsByTerm(
    paths,
    field,
    term,
    searchToken,
    profile = null,
    bucketLayoutVersion = LEGACY_INDEX_BUCKET_LAYOUT_VERSION
  ) {
    if (this.termService.hasWildcards(term)) {
      return await this.findDocIdsByWildcard(
        paths,
        field,
        term,
        searchToken,
        profile,
        bucketLayoutVersion
      );
    }

    const bucketPath = paths.getIndexBucketPath(
      field,
      this.termService.getIndexBucketName(field, term, bucketLayoutVersion)
    );
    const matches = [];
    const startedAt = performance.now();
    let scannedEntries = 0;

    try {
      for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
        if (searchToken.cancelled) return [];
        scannedEntries += 1;
        if (entry.term === term) {
          matches.push(entry.docId);
        }
      }
    } catch {
      return [];
    }

    if (profile) {
      profile.lookupBuckets.push({
        kind: "index",
        field,
        bucketPath,
        scannedEntries,
        matchedDocIds: matches.length,
        durationMs: performance.now() - startedAt,
      });
    }

    return matches;
  }

  async findDocIdsByWildcard(
    paths,
    field,
    term,
    searchToken,
    profile = null,
    bucketLayoutVersion = LEGACY_INDEX_BUCKET_LAYOUT_VERSION
  ) {
    const bucketFiles = await this.resolveWildcardBuckets(
      paths,
      field,
      term,
      bucketLayoutVersion
    );
    if (bucketFiles.length === 0) return [];

    const regex = this.termService.buildWildcardRegex(term);
    const matches = new Set();

    for (const bucketPath of bucketFiles) {
      const startedAt = performance.now();
      let scannedEntries = 0;

      try {
        for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
          if (searchToken.cancelled) return [];
          scannedEntries += 1;
          if (regex.test(entry.term)) {
            matches.add(entry.docId);
          }
        }
      } catch {
        continue;
      }

      if (profile) {
        profile.wildcardBuckets.push({
          field,
          bucketPath,
          scannedEntries,
          matchedDocIds: matches.size,
          durationMs: performance.now() - startedAt,
        });
      }
    }

    return [...matches];
  }

  async resolveWildcardBuckets(
    paths,
    field,
    term,
    bucketLayoutVersion = LEGACY_INDEX_BUCKET_LAYOUT_VERSION
  ) {
    try {
      const prefix = this.termService.getWildcardPrefix(term);
      const normalizedPrefix = this.termService.normalizeBucketTerm(field, prefix);
      const { prefixLength, hashLength = 0 } = getBucketLayout(field, bucketLayoutVersion);

      if (prefix) {
        if (normalizedPrefix.length >= prefixLength && hashLength <= 0) {
          return [
            paths.getIndexBucketPath(
              field,
              this.termService.getIndexBucketName(field, normalizedPrefix, bucketLayoutVersion)
            ),
          ];
        }

        const fileNames = await this.jsonLinesRepository.listFilesRecursive(
          paths.getIndexFieldDir(field),
          ".jsonl"
        );
        return fileNames
          .filter((fileName) =>
            this.termService.matchesWildcardBucketName(
              field,
              path.basename(fileName, ".jsonl"),
              normalizedPrefix,
              bucketLayoutVersion
            )
          )
          .map((fileName) => paths.getIndexBucketPath(field, path.basename(fileName, ".jsonl")));
      }

      const fileNames = await this.jsonLinesRepository.listFilesRecursive(
        paths.getIndexFieldDir(field),
        ".jsonl"
      );
      return fileNames.map((fileName) =>
        paths.getIndexBucketPath(field, path.basename(fileName, ".jsonl"))
      );
    } catch {
      return [];
    }
  }

  estimateBucketEntries(queryEntry, bucketStats) {
    if (!bucketStats?.fields || this.termService.hasWildcards(queryEntry.term)) {
      return Number.MAX_SAFE_INTEGER;
    }

    const bucketName = this.termService.getIndexBucketName(
      queryEntry.field,
      queryEntry.term,
      queryEntry.bucketLayoutVersion
    );

    return Number(bucketStats.fields?.[queryEntry.field]?.[bucketName] || Number.MAX_SAFE_INTEGER);
  }

  intersectDocIdSets(docIdSets) {
    if (docIdSets.length === 0) return [];
    if (docIdSets.length === 1) return [...new Set(docIdSets[0])];

    const [firstSet, ...restSets] = docIdSets.map((set) => new Set(set));
    return [...firstSet].filter((docId) => restSets.every((set) => set.has(docId)));
  }

  async loadDocumentsByIds(paths, docIds, searchToken, profile = null) {
    const targetDocIds = new Set(docIds);
    const docOrder = new Map(docIds.map((docId, index) => [docId, index]));
    const embeddedDocuments = [];
    const compactLookupEntries = [];
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
      const startedAt = performance.now();
      let scannedEntries = 0;
      let resolvedDocuments = 0;

      try {
        for await (const entry of this.jsonLinesRepository.iterateJson(bucketPath)) {
          if (searchToken.cancelled) return [];
          scannedEntries += 1;
          if (bucketSet.has(entry.docId) && targetDocIds.has(entry.docId)) {
            if (this.isEmbeddedDocumentLookupEntry(entry)) {
              embeddedDocuments.push({
                docId: entry.docId,
                document: entry,
              });
            } else if (this.isCompactDocumentLookupEntry(entry)) {
              compactLookupEntries.push(entry);
            } else {
              continue;
            }

            resolvedDocuments += 1;
            targetDocIds.delete(entry.docId);
            if (targetDocIds.size === 0) break;
          }
        }
      } catch {
        continue;
      }

      if (profile) {
        profile.lookupBuckets.push({
          kind: "documentLookup",
          bucket,
          bucketPath,
          requestedDocIds: bucketDocIds.length,
          scannedEntries,
          resolvedDocuments,
          remainingDocIds: targetDocIds.size,
          durationMs: performance.now() - startedAt,
        });
      }

      if (targetDocIds.size === 0) break;
    }

    const compactDocuments = await this.loadDocumentsFromLookupEntries(
      paths,
      compactLookupEntries,
      searchToken
    );

    return [...embeddedDocuments, ...compactDocuments]
      .sort((left, right) => {
        return (docOrder.get(left.docId) ?? Number.MAX_SAFE_INTEGER) -
          (docOrder.get(right.docId) ?? Number.MAX_SAFE_INTEGER);
      })
      .map((entry) => entry.document);
  }

  isEmbeddedDocumentLookupEntry(entry) {
    return Boolean(entry?.fields || entry?.invalidFields);
  }

  isCompactDocumentLookupEntry(entry) {
    return Boolean(
      entry?.fileName &&
      Number.isFinite(entry?.byteOffset) &&
      Number.isFinite(entry?.byteLength)
    );
  }

  async loadDocumentsFromLookupEntries(paths, lookupEntries, searchToken) {
    if (lookupEntries.length === 0) {
      return [];
    }

    const entriesByFile = new Map();
    for (const entry of lookupEntries) {
      const fileEntries = entriesByFile.get(entry.fileName) || [];
      fileEntries.push(entry);
      entriesByFile.set(entry.fileName, fileEntries);
    }

    const documents = [];

    for (const [fileName, fileEntries] of entriesByFile.entries()) {
      if (searchToken.cancelled) {
        return [];
      }

      const sortedEntries = [...fileEntries].sort((left, right) => left.byteOffset - right.byteOffset);

      try {
        const rawDocuments = await this.jsonLinesRepository.readChunks(
          paths.getDocumentPath(fileName),
          sortedEntries.map((entry) => ({
            byteOffset: entry.byteOffset,
            byteLength: entry.byteLength,
          }))
        );

        for (let index = 0; index < sortedEntries.length; index += 1) {
          if (searchToken.cancelled) {
            return [];
          }

          documents.push({
            docId: sortedEntries[index].docId,
            document: JSON.parse(rawDocuments[index]),
          });
        }
      } catch {
        continue;
      }
    }

    return documents;
  }

  async loadSourceMeta(paths) {
    const sources = await this.stateRepository.readSources(paths);
    return new Map(sources.map((source) => [source.sourceTable, source]));
  }

  mapSourceResult(sourceTable, sourceMeta) {
    return {
      name_table: sourceTable,
      name: sourceMeta?.name || sourceTable,
      info:
        sourceMeta?.description ||
        (sourceMeta?.fileName
          ? localDbMessages.searchBaseInfo(sourceMeta.fileName)
          : localDbMessages.localSourceInfo),
      type: sourceMeta?.type || "local-import",
      type_sources: sourceMeta?.type || "local-import",
    };
  }
}
