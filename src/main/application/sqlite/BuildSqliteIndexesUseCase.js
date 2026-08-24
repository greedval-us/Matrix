import { INDEXABLE_FIELDS, SQLITE_INDEX_BATCH_DOCUMENTS, SQLITE_INDEX_FORMAT_VERSION } from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";

export class BuildSqliteIndexesUseCase {
  constructor({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    termService,
    indexStore,
    batchDocuments = SQLITE_INDEX_BATCH_DOCUMENTS,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.termService = termService;
    this.indexStore = indexStore;
    this.batchDocuments = batchDocuments;
    this.cancelRequested = false;
  }

  cancel() {
    this.cancelRequested = true;
  }

  async execute(options = {}) {
    this.cancelRequested = false;
    const rootPath = this.localDatabaseService.getStoredRootPath();
    await this.localDatabaseService.ensureReady(rootPath);
    const paths = new LocalDatabasePaths(rootPath);
    const files = await this.jsonLinesRepository.listFiles(paths.documentsDir, ".jsonl");
    const fileManifest = await this.buildFileManifest(paths, files);

    if (options.clean) {
      this.indexStore.close();
      await this.jsonLinesRepository.remove(paths.sqliteIndexesDir);
      await this.jsonLinesRepository.remove(paths.legacySqliteIndexesDir);
      await this.jsonLinesRepository.remove(paths.legacySqliteV2IndexesDir);
      await this.jsonLinesRepository.remove(paths.sqliteIndexStatePath);
    }
    await this.indexStore.ensureDirectories();

    const state = await this.restoreState(paths, files, fileManifest);
    const plannedFiles = state.files;
    if (state.nextFileIndex < plannedFiles.length) {
      state.wildcard = {
        status: "pending",
        indexedDocuments: 0,
        completedShards: [],
      };
    }
    state.status = "running";
    state.updatedAt = new Date().toISOString();
    await this.stateRepository.writeSqliteIndexState(paths, state);
    options.onProgress?.(this.progress(state));

    const fileLimit = Number.isFinite(options.maxFiles)
      ? Math.max(0, Math.trunc(options.maxFiles))
      : Number.POSITIVE_INFINITY;
    let processedThisRun = 0;

    try {
      while (state.nextFileIndex < plannedFiles.length && processedThisRun < fileLimit) {
        if (this.cancelRequested) break;
        const fileName = plannedFiles[state.nextFileIndex];
        const stat = await this.jsonLinesRepository.stat(paths.getDocumentPath(fileName));
        this.validateCurrentFile(state, fileName, stat);
        state.currentFile = fileName;
        state.currentFileSize = stat.size;
        state.currentFileMtimeMs = stat.mtimeMs;
        await this.processFile(paths, fileName, state, options);
        if (this.cancelRequested) break;

        state.completedFiles.push(fileName);
        state.nextFileIndex += 1;
        state.currentFile = null;
        state.currentFileSize = null;
        state.currentFileMtimeMs = null;
        state.byteOffset = 0;
        state.updatedAt = new Date().toISOString();
        processedThisRun += 1;
        await this.stateRepository.writeSqliteIndexState(paths, state);
        options.onProgress?.(this.progress(state));
      }

      state.status = state.nextFileIndex >= plannedFiles.length ? "completed" : "cancelled";
      state.updatedAt = new Date().toISOString();
      await this.stateRepository.writeSqliteIndexState(paths, state);
      options.onProgress?.(this.progress(state));
      return state;
    } catch (error) {
      state.status = "failed";
      state.error = error.message;
      state.updatedAt = new Date().toISOString();
      await this.stateRepository.writeSqliteIndexState(paths, state);
      throw error;
    }
  }

  async processFile(paths, fileName, state, options) {
    const batch = [];
    let nextOffset = state.byteOffset || 0;
    const flush = async () => {
      if (batch.length === 0) return;
      await this.indexStore.writeBatch(batch);
      state.byteOffset = nextOffset;
      state.indexedDocuments += batch.length;
      batch.length = 0;
      state.updatedAt = new Date().toISOString();
      await this.stateRepository.writeSqliteIndexState(paths, state);
      options.onProgress?.(this.progress(state));
    };

    for await (const entry of this.jsonLinesRepository.iterateLinesWithMetadataFrom(
      paths.getDocumentPath(fileName),
      state.byteOffset || 0
    )) {
      if (this.cancelRequested) break;
      const document = JSON.parse(entry.line);
      batch.push(this.mapDocument(document, fileName, entry));
      nextOffset = entry.byteOffset + entry.byteLength + 1;
      if (batch.length >= this.batchDocuments) {
        await flush();
        if (this.cancelRequested) break;
      }
    }
    await flush();
  }

  mapDocument(document, fileName, entry) {
    const indexTerms = {};
    for (const field of INDEXABLE_FIELDS) {
      const terms = this.collectTerms(document, field);
      if (terms.length > 0) indexTerms[field] = terms;
    }
    return {
      docId: String(document.docId),
      sourceTable: document.sourceTable,
      fileName,
      byteOffset: entry.byteOffset,
      byteLength: entry.byteLength,
      indexTerms,
    };
  }

  collectTerms(document, field) {
    const terms = new Set();
    const value = document.fields?.[field];
    if (value !== null && value !== undefined && value !== "") {
      const normalized = this.termService.normalizeIndexTerm(field, value);
      if (normalized) terms.add(normalized);
    }
    const invalidValue = document.invalidFields?.[`no_valid_${field}`];
    if (invalidValue !== null && invalidValue !== undefined && invalidValue !== "") {
      for (const term of this.termService.extractFallbackIndexTerms(field, invalidValue)) {
        if (term) terms.add(term);
      }
    }
    return [...terms];
  }

  async restoreState(paths, files, fileManifest) {
    const previous = await this.stateRepository.readSqliteIndexState(paths);
    const sameFormat = previous?.formatVersion === SQLITE_INDEX_FORMAT_VERSION;
    const previousFiles = Array.isArray(previous?.files) ? previous.files : [];
    const unchanged = sameFormat && previous.fileManifest && previousFiles.every((file) =>
      fileManifest[file] &&
      previous.fileManifest[file]?.size === fileManifest[file].size &&
      previous.fileManifest[file]?.mtimeMs === fileManifest[file].mtimeMs
    );
    if (sameFormat && !unchanged) {
      throw new Error("An indexed document file was changed or removed. Run again with --clean.");
    }
    if (unchanged) {
      const previousSet = new Set(previousFiles);
      const addedFiles = files.filter((file) => !previousSet.has(file));
      const plannedFiles = [...previousFiles, ...addedFiles];
      return {
        ...previous,
        files: plannedFiles,
        filesTotal: plannedFiles.length,
        fileManifest,
        completedFiles: previous.completedFiles || [],
        byteOffset: Number(previous.byteOffset) || 0,
        indexedDocuments: Number(previous.indexedDocuments) || 0,
        error: null,
      };
    }
    return {
      formatVersion: SQLITE_INDEX_FORMAT_VERSION,
      status: "pending",
      files,
      filesTotal: files.length,
      fileManifest,
      completedFiles: [],
      nextFileIndex: 0,
      currentFile: null,
      byteOffset: 0,
      indexedDocuments: 0,
      wildcard: {
        status: "pending",
        indexedDocuments: 0,
        completedShards: [],
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  async buildFileManifest(paths, files) {
    const manifest = {};
    for (const fileName of files) {
      const stat = await this.jsonLinesRepository.stat(paths.getDocumentPath(fileName));
      manifest[fileName] = { size: stat.size, mtimeMs: stat.mtimeMs };
    }
    return manifest;
  }

  validateCurrentFile(state, fileName, stat) {
    if (state.currentFile && state.currentFile !== fileName) {
      throw new Error(`Checkpoint expects ${state.currentFile}, but found ${fileName}.`);
    }
    if (state.byteOffset > 0 &&
      (state.currentFileSize !== stat.size || state.currentFileMtimeMs !== stat.mtimeMs)) {
      throw new Error(`Source file changed after checkpoint: ${fileName}`);
    }
  }

  progress(state) {
    return {
      status: state.status,
      filesProcessed: state.nextFileIndex,
      filesTotal: state.filesTotal,
      indexedDocuments: state.indexedDocuments,
      currentFile: state.currentFile,
      byteOffset: state.byteOffset,
      currentFileSize: state.currentFileSize,
    };
  }
}
