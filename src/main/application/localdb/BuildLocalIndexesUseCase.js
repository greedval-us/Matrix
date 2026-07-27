import {
  BUFFER_FLUSH_SIZE,
  INDEXABLE_FIELDS,
  INDEX_BACKUP_TEMP_PREFIX,
  INDEX_BUILD_TEMP_PREFIX,
  PROGRESS_SAVE_INTERVAL,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";
import { ProgressReporter } from "../../localdb/ProgressReporter.js";

class IndexBuildCancelledError extends Error {
  constructor(reason = "cancelled") {
    super("Index build cancelled");
    this.name = "IndexBuildCancelledError";
    this.reason = reason;
  }
}

export class BuildLocalIndexesUseCase {
  constructor({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    operationCoordinator,
    termService,
    indexBuildPlanner,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.operationCoordinator = operationCoordinator;
    this.termService = termService;
    this.indexBuildPlanner = indexBuildPlanner;
    this.currentBuildToken = null;
  }

  async execute(options = {}) {
    const progress = new ProgressReporter(options.onProgress);

    return await this.operationCoordinator.runExclusive("local-db-index", async () => {
      const databaseRootPath = this.localDatabaseService.getStoredRootPath();
      const databaseStatus = await this.localDatabaseService.ensureReady(databaseRootPath);

      if (!databaseStatus.initialized) {
        throw new Error(localDbMessages.databaseNotInitialized);
      }

      const paths = new LocalDatabasePaths(databaseRootPath);
      const documentFiles = await this.jsonLinesRepository.listFiles(paths.documentsDir, ".jsonl");
      const previousState = await this.stateRepository.readIndexState(paths);

      if (documentFiles.length === 0) {
        throw new Error(localDbMessages.noIndexedDocuments);
      }

      const buildToken = {
        cancelled: false,
        reason: null,
      };
      this.currentBuildToken = buildToken;

      try {
        return await this.runBuild({
          options,
          progress,
          paths,
          documentFiles,
          previousState,
          buildToken,
        });
      } finally {
        if (this.currentBuildToken === buildToken) {
          this.currentBuildToken = null;
        }
      }
    });
  }

  cancel(reason = "manual-stop") {
    if (this.currentBuildToken) {
      this.currentBuildToken.cancelled = true;
      this.currentBuildToken.reason = reason;
    }
  }

  async runBuild({ options, progress, paths, documentFiles, previousState, buildToken }) {
    const resumableSession = await this.tryCreateResumeSession({
      paths,
      documentFiles,
      previousState,
    });

    if (resumableSession) {
      return await this.resumeBuild({
        options,
        progress,
        paths,
        summary: resumableSession.summary,
        filePlans: resumableSession.filePlans,
        workingIndexesDir: resumableSession.workingIndexesDir,
        backupIndexesDir: resumableSession.backupIndexesDir,
        buildToken,
      });
    }

    const buildPlan = await this.indexBuildPlanner.createPlan({
      paths,
      documentFiles,
      previousState,
    });

    if (buildPlan.mode === "noop") {
      return await this.completeWithoutChanges(paths, previousState, buildPlan, progress);
    }

    const startedAt = new Date().toISOString();
    const buildId = startedAt.replace(/[:.]/g, "-");
    const workingIndexesDir = paths.getTempPath(`${INDEX_BUILD_TEMP_PREFIX}-${buildId}`);
    const backupIndexesDir = paths.getTempPath(`${INDEX_BACKUP_TEMP_PREFIX}-${buildId}`);
    const summary = this.createRunningSummary({
      buildPlan,
      buildId,
      startedAt,
      workingIndexesDir,
      backupIndexesDir,
      filePlans: buildPlan.filePlans,
    });

    await this.jsonLinesRepository.remove(workingIndexesDir);
    await this.prepareWorkingIndexes(paths, workingIndexesDir, buildPlan.mode);
    await this.stateRepository.writeIndexState(paths, summary);

    progress.emit("started", this.buildStartedPayload(summary));

    return await this.processFilePlans({
      progress,
      paths,
      summary,
      filePlans: buildPlan.filePlans,
      workingIndexesDir,
      backupIndexesDir,
      buildToken,
    });
  }

  async tryCreateResumeSession({ paths, documentFiles, previousState }) {
    if (!previousState?.session?.resumable) return null;
    if (!["cancelled", "running"].includes(previousState.status)) return null;

    const workingIndexesDir = previousState.session.workingIndexesDir;
    if (!workingIndexesDir || !(await this.jsonLinesRepository.exists(workingIndexesDir))) {
      return null;
    }

    const resumePlan = await this.indexBuildPlanner.createResumePlan({
      paths,
      documentFiles,
      previousState,
    });
    if (!resumePlan) {
      await this.cleanupAbandonedSession(paths, previousState);
      return null;
    }

    const summary = this.createResumedSummary(previousState, resumePlan);
    await this.removeCurrentFileWorkDir(summary, paths);
    await this.stateRepository.writeIndexState(paths, summary);

    return {
      summary,
      filePlans: resumePlan.filePlans,
      workingIndexesDir,
      backupIndexesDir:
        previousState.session.backupIndexesDir ||
        paths.getTempPath(`${INDEX_BACKUP_TEMP_PREFIX}-${summary.session.buildId}`),
    };
  }

  async resumeBuild({
    progress,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    buildToken,
  }) {
    progress.emit("started", this.buildStartedPayload(summary));

    return await this.processFilePlans({
      progress,
      paths,
      summary,
      filePlans,
      workingIndexesDir,
      backupIndexesDir,
      buildToken,
    });
  }

  createRunningSummary({
    buildPlan,
    buildId,
    startedAt,
    workingIndexesDir,
    backupIndexesDir,
    filePlans,
  }) {
    return {
      status: "running",
      buildMode: buildPlan.mode,
      buildReason: buildPlan.reason,
      indexedAt: startedAt,
      startedAt,
      resumedAt: null,
      documentFiles: filePlans.map((plan) => plan.fileName),
      filesTotal: filePlans.length,
      filesProcessed: 0,
      indexedDocuments: 0,
      documentsTotal: buildPlan.documentsTotal,
      indexedEntries: 0,
      lookupEntries: 0,
      reusedFiles: buildPlan.reusedFiles,
      reusedDocuments: buildPlan.reusedDocuments,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      completedAt: null,
      error: null,
      fileManifest: buildPlan.fileManifest,
      fields: Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
      session: {
        resumable: true,
        buildId,
        workingIndexesDir,
        backupIndexesDir,
        completedFiles: [],
        pendingFiles: filePlans.map((plan) => plan.fileName),
      },
    };
  }

  createResumedSummary(previousState, resumePlan) {
    return {
      ...previousState,
      status: "running",
      resumedAt: new Date().toISOString(),
      completedAt: null,
      error: null,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      filesTotal: resumePlan.filePlans.length,
      documentsTotal: resumePlan.documentsTotal,
      session: {
        ...previousState.session,
        pendingFiles: resumePlan.filePlans.map((plan) => plan.fileName),
      },
    };
  }

  async completeWithoutChanges(paths, previousState, buildPlan, progress) {
    const completedAt = new Date().toISOString();
    const summary = {
      ...(previousState || {}),
      status: "completed",
      buildMode: buildPlan.mode,
      buildReason: buildPlan.reason,
      indexedAt: completedAt,
      startedAt: previousState?.startedAt || completedAt,
      resumedAt: null,
      completedAt,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      documentFiles: [],
      filesTotal: 0,
      filesProcessed: 0,
      indexedDocuments: 0,
      documentsTotal: 0,
      indexedEntries: 0,
      lookupEntries: 0,
      reusedFiles: buildPlan.reusedFiles,
      reusedDocuments: buildPlan.reusedDocuments,
      fileManifest: buildPlan.fileManifest,
      fields:
        previousState?.fields ||
        Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
      session: null,
    };

    await this.stateRepository.writeIndexState(paths, summary);
    progress.emit("started", this.buildStartedPayload(summary));
    progress.emit("completed", this.buildCompletedPayload(summary));
    return summary;
  }

  async processFilePlans({
    progress,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    buildToken,
  }) {
    try {
      for (const filePlan of filePlans) {
        this.throwIfCancelled(buildToken);

        summary.currentFile = filePlan.fileName;
        summary.currentFileDocumentsProcessed = 0;
        summary.currentFileDocumentsTotal = filePlan.documentsTotal;
        await this.stateRepository.writeIndexState(paths, summary);

        const fileWorkDir = this.getFileWorkDir(paths, summary, filePlan.fileName);
        await this.jsonLinesRepository.remove(fileWorkDir);
        await this.prepareIndexDirectories(paths, fileWorkDir);

        try {
          const fileResult = await this.indexDocumentFile({
            filePath: filePlan.filePath,
            filePlan,
            paths,
            indexesDir: fileWorkDir,
            summary,
            progress,
            buildToken,
          });

          await this.mergeIndexedFile(paths, fileWorkDir, workingIndexesDir);
          await this.jsonLinesRepository.remove(fileWorkDir);
          this.commitFileResult(summary, filePlan, fileResult);
          await this.stateRepository.writeIndexState(paths, summary);
          progress.emit("file-completed", this.buildFileCompletedPayload(summary, filePlan));
        } catch (error) {
          await this.jsonLinesRepository.remove(fileWorkDir);
          if (error instanceof IndexBuildCancelledError) {
            return await this.handleCancellation({
              error,
              progress,
              paths,
              summary,
              filePlan,
            });
          }
          throw error;
        }
      }

      await this.replaceIndexesAtomically(paths, workingIndexesDir, backupIndexesDir);
      return await this.completeBuild(paths, summary, progress);
    } catch (error) {
      if (error instanceof IndexBuildCancelledError) {
        return await this.handleCancellation({
          error,
          progress,
          paths,
          summary,
        });
      }

      return await this.failBuild(paths, summary, workingIndexesDir, progress, error);
    }
  }

  async completeBuild(paths, summary, progress) {
    summary.status = "completed";
    summary.currentFile = null;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = 0;
    summary.completedAt = new Date().toISOString();
    summary.error = null;
    summary.session = null;

    await this.stateRepository.writeIndexState(paths, summary);
    await this.stateRepository.updateDatabaseMeta(paths, (meta) => ({
      ...meta,
      updatedAt: summary.completedAt,
      indexes: {
        ...(meta.indexes || {}),
        version: 1,
        builtAt: summary.completedAt,
        fields: INDEXABLE_FIELDS,
      },
    }));
    progress.emit("completed", this.buildCompletedPayload(summary));

    return summary;
  }

  async failBuild(paths, summary, workingIndexesDir, progress, error) {
    summary.status = "failed";
    summary.error = error.message;
    summary.currentFile = null;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = 0;
    summary.completedAt = new Date().toISOString();
    summary.session = null;
    await this.stateRepository.writeIndexState(paths, summary);
    await this.jsonLinesRepository.remove(workingIndexesDir);
    progress.emit("failed", {
      error: error.message,
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      buildMode: summary.buildMode,
    });
    throw error;
  }

  async handleCancellation({ error, progress, paths, summary, filePlan = null }) {
    summary.status = "cancelled";
    summary.error = null;
    summary.completedAt = new Date().toISOString();
    summary.currentFile = filePlan?.fileName || summary.currentFile;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = filePlan?.documentsTotal || summary.currentFileDocumentsTotal;
    if (summary.session) {
      const pendingFiles = new Set(summary.session.pendingFiles || []);
      if (summary.currentFile) {
        pendingFiles.add(summary.currentFile);
      }
      summary.session.pendingFiles = [...pendingFiles];
    }

    await this.stateRepository.writeIndexState(paths, summary);
    progress.emit("cancelled", {
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments,
      documentsTotal: summary.documentsTotal,
      currentFile: summary.currentFile,
      buildMode: summary.buildMode,
      reason: error.reason,
    });

    return summary;
  }

  async prepareWorkingIndexes(paths, workingIndexesDir, buildMode) {
    if (buildMode === "incremental" && (await this.jsonLinesRepository.exists(paths.indexesDir))) {
      await this.jsonLinesRepository.copy(paths.indexesDir, workingIndexesDir);
    }

    await this.prepareIndexDirectories(paths, workingIndexesDir);
  }

  async prepareIndexDirectories(paths, indexesDir = paths.indexesDir) {
    for (const field of INDEXABLE_FIELDS) {
      await this.jsonLinesRepository.ensureDirectory(paths.getIndexFieldDir(field, indexesDir));
    }

    await this.jsonLinesRepository.ensureDirectory(paths.getDocumentLookupDir(indexesDir));
  }

  async indexDocumentFile({
    filePath,
    filePlan,
    paths,
    indexesDir,
    summary,
    progress,
    buildToken,
  }) {
    const bufferMap = new Map();
    let documentsSinceLastSave = 0;
    let fileDocumentsProcessed = 0;
    const fileResult = {
      indexedDocuments: 0,
      indexedEntries: 0,
      lookupEntries: 0,
      fields: Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
    };

    try {
      for await (const document of this.jsonLinesRepository.iterateJson(filePath)) {
        this.throwIfCancelled(buildToken);

        fileDocumentsProcessed += 1;
        documentsSinceLastSave += 1;
        fileResult.indexedDocuments += 1;

        await this.bufferDocumentLookup(paths, indexesDir, document, bufferMap, fileResult);
        await this.bufferFieldIndexes(paths, indexesDir, document, bufferMap, fileResult);

        if (documentsSinceLastSave >= PROGRESS_SAVE_INTERVAL) {
          await this.flushAllBuffers(bufferMap);
          summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
          await this.stateRepository.writeIndexState(paths, summary);
          progress.emit("progress", this.buildProgressPayload(summary, filePlan, fileResult));
          documentsSinceLastSave = 0;
        }
      }
    } finally {
      await this.flushAllBuffers(bufferMap);
    }

    summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
    progress.emit("progress", this.buildProgressPayload(summary, filePlan, fileResult));
    return fileResult;
  }

  async bufferFieldIndexes(paths, indexesDir, document, bufferMap, fileResult) {
    for (const field of INDEXABLE_FIELDS) {
      const terms = this.collectDocumentIndexTerms(document, field);
      for (const term of terms) {
        const bucket = this.termService.getBucketName(term);
        const bucketFile = paths.getIndexBucketPath(field, bucket, indexesDir);
        const entry = JSON.stringify({
          term,
          docId: document.docId,
          sourceTable: document.sourceTable,
          rowId: document.rowId,
        });

        await this.pushBufferedLine(bufferMap, bucketFile, entry);
        fileResult.indexedEntries += 1;
        fileResult.fields[field] += 1;
      }
    }
  }

  collectDocumentIndexTerms(document, field) {
    const terms = new Set();
    const rawValue = document.fields?.[field];
    if (rawValue !== null && rawValue !== undefined && rawValue !== "") {
      const normalized = this.termService.normalizeIndexTerm(field, rawValue);
      if (normalized) {
        terms.add(normalized);
      }
    }

    const invalidValue = document.invalidFields?.[`no_valid_${field}`];
    if (invalidValue !== null && invalidValue !== undefined && invalidValue !== "") {
      for (const fallbackTerm of this.termService.extractFallbackIndexTerms(field, invalidValue)) {
        if (fallbackTerm) {
          terms.add(fallbackTerm);
        }
      }
    }

    return [...terms];
  }

  async bufferDocumentLookup(paths, indexesDir, document, bufferMap, fileResult) {
    const lookupBucket = this.termService.getDocumentBucketName(document.docId);
    const lookupFile = paths.getDocumentLookupBucketPath(lookupBucket, indexesDir);
    const entry = JSON.stringify({
      docId: document.docId,
      sourceTable: document.sourceTable,
      rowId: document.rowId,
      fields: document.fields,
      invalidFields: document.invalidFields,
    });

    await this.pushBufferedLine(bufferMap, lookupFile, entry);
    fileResult.lookupEntries += 1;
  }

  async pushBufferedLine(bufferMap, filePath, line) {
    const existing = bufferMap.get(filePath) || [];
    existing.push(line);
    bufferMap.set(filePath, existing);

    if (existing.length >= BUFFER_FLUSH_SIZE) {
      await this.flushBuffer(bufferMap, filePath);
    }
  }

  async flushBuffer(bufferMap, filePath) {
    const lines = bufferMap.get(filePath);
    if (!lines || lines.length === 0) return;

    await this.jsonLinesRepository.appendLines(filePath, lines);
    bufferMap.set(filePath, []);
  }

  async flushAllBuffers(bufferMap) {
    for (const filePath of bufferMap.keys()) {
      await this.flushBuffer(bufferMap, filePath);
    }
  }

  async mergeIndexedFile(paths, sourceIndexesDir, targetIndexesDir) {
    for (const field of INDEXABLE_FIELDS) {
      const sourceFieldDir = paths.getIndexFieldDir(field, sourceIndexesDir);
      if (!(await this.jsonLinesRepository.exists(sourceFieldDir))) continue;

      const bucketFiles = await this.jsonLinesRepository.listFiles(sourceFieldDir, ".jsonl");
      for (const bucketFile of bucketFiles) {
        const sourcePath = paths.getIndexBucketPath(field, bucketFile.slice(0, -6), sourceIndexesDir);
        const targetPath = paths.getIndexBucketPath(field, bucketFile.slice(0, -6), targetIndexesDir);
        await this.copyJsonLines(sourcePath, targetPath);
      }
    }

    const sourceLookupDir = paths.getDocumentLookupDir(sourceIndexesDir);
    if (await this.jsonLinesRepository.exists(sourceLookupDir)) {
      const bucketFiles = await this.jsonLinesRepository.listFiles(sourceLookupDir, ".jsonl");
      for (const bucketFile of bucketFiles) {
        const sourcePath = paths.getDocumentLookupBucketPath(bucketFile.slice(0, -6), sourceIndexesDir);
        const targetPath = paths.getDocumentLookupBucketPath(bucketFile.slice(0, -6), targetIndexesDir);
        await this.copyJsonLines(sourcePath, targetPath);
      }
    }
  }

  async copyJsonLines(sourcePath, targetPath) {
    const lines = [];
    for await (const line of this.jsonLinesRepository.iterateLines(sourcePath)) {
      lines.push(line);
    }
    await this.jsonLinesRepository.appendLines(targetPath, lines);
  }

  commitFileResult(summary, filePlan, fileResult) {
    summary.filesProcessed += 1;
    summary.indexedDocuments += fileResult.indexedDocuments;
    summary.indexedEntries += fileResult.indexedEntries;
    summary.lookupEntries += fileResult.lookupEntries;
    summary.currentFile = filePlan.fileName;
    summary.currentFileDocumentsProcessed = filePlan.documentsTotal;
    summary.currentFileDocumentsTotal = filePlan.documentsTotal;

    for (const field of INDEXABLE_FIELDS) {
      summary.fields[field] += fileResult.fields[field] || 0;
    }

    if (summary.session) {
      summary.session.completedFiles = [...(summary.session.completedFiles || []), filePlan.fileName];
      summary.session.pendingFiles = (summary.session.pendingFiles || []).filter(
        (fileName) => fileName !== filePlan.fileName
      );
    }
  }

  buildStartedPayload(summary) {
    return {
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments,
      documentsTotal: summary.documentsTotal,
      buildMode: summary.buildMode,
      reusedFiles: summary.reusedFiles,
      reusedDocuments: summary.reusedDocuments,
      resumable: Boolean(summary.session?.resumable),
    };
  }

  buildProgressPayload(summary, filePlan, fileResult) {
    return {
      currentFile: filePlan.fileName,
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments + fileResult.indexedDocuments,
      documentsTotal: summary.documentsTotal,
      indexedEntries: summary.indexedEntries + fileResult.indexedEntries,
      fileDocumentsProcessed: summary.currentFileDocumentsProcessed,
      fileDocumentsTotal: filePlan.documentsTotal,
      buildMode: summary.buildMode,
      resumable: Boolean(summary.session?.resumable),
    };
  }

  buildFileCompletedPayload(summary, filePlan) {
    return {
      currentFile: filePlan.fileName,
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments,
      indexedEntries: summary.indexedEntries,
      documentsTotal: summary.documentsTotal,
      fileDocumentsProcessed: filePlan.documentsTotal,
      fileDocumentsTotal: filePlan.documentsTotal,
      buildMode: summary.buildMode,
      resumable: Boolean(summary.session?.resumable),
    };
  }

  buildCompletedPayload(summary) {
    return {
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments,
      indexedEntries: summary.indexedEntries,
      buildMode: summary.buildMode,
      reusedFiles: summary.reusedFiles,
      reusedDocuments: summary.reusedDocuments,
      resumable: false,
    };
  }

  getFileWorkDir(paths, summary, fileName) {
    const safeName = encodeURIComponent(fileName.toLowerCase());
    return paths.getTempPath(`${INDEX_BUILD_TEMP_PREFIX}-${summary.session.buildId}-file-${safeName}`);
  }

  async removeCurrentFileWorkDir(summary, paths) {
    if (!summary.currentFile || !summary.session?.buildId) return;
    const fileWorkDir = this.getFileWorkDir(paths, summary, summary.currentFile);
    await this.jsonLinesRepository.remove(fileWorkDir);
  }

  throwIfCancelled(buildToken) {
    if (buildToken?.cancelled) {
      throw new IndexBuildCancelledError(buildToken.reason);
    }
  }

  async cleanupAbandonedSession(paths, previousState) {
    if (previousState?.session?.workingIndexesDir) {
      await this.jsonLinesRepository.remove(previousState.session.workingIndexesDir);
    }
    if (previousState?.session?.backupIndexesDir) {
      await this.jsonLinesRepository.remove(previousState.session.backupIndexesDir);
    }
    await this.removeCurrentFileWorkDir(previousState, paths);
  }

  async replaceIndexesAtomically(paths, tempIndexesDir, backupIndexesDir) {
    await this.jsonLinesRepository.remove(backupIndexesDir);

    if (await this.jsonLinesRepository.exists(paths.indexesDir)) {
      await this.jsonLinesRepository.move(paths.indexesDir, backupIndexesDir);
    }

    try {
      await this.jsonLinesRepository.move(tempIndexesDir, paths.indexesDir);
      await this.jsonLinesRepository.remove(backupIndexesDir);
    } catch (error) {
      if (await this.jsonLinesRepository.exists(backupIndexesDir)) {
        await this.jsonLinesRepository.move(backupIndexesDir, paths.indexesDir);
      }
      throw error;
    }
  }
}
