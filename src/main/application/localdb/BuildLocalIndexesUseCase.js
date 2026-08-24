import path from "path";
import {
  BUFFER_FLUSH_SIZE,
  DOCUMENT_LOOKUP_FORMAT_VERSION,
  INDEXABLE_FIELDS,
  INDEX_BACKUP_TEMP_PREFIX,
  INDEX_BUILD_TEMP_PREFIX,
  LEGACY_INDEX_BUCKET_LAYOUT_VERSION,
  PROGRESS_EMIT_INTERVAL,
  PROGRESS_SAVE_INTERVAL,
} from "../../localdb/constants.js";
import {
  buildRecommendedBucketLayoutMap,
  normalizeBucketLayoutMap,
  resolveGlobalBucketLayoutVersion,
} from "../../localdb/indexBucketLayouts.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";
import { ProgressReporter } from "../../localdb/ProgressReporter.js";
import log from "../../utils/logger.js";

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
    const workerCount = this.normalizeWorkerCount(options.workerCount);
    const stageOnly = Boolean(options.stageOnly);
    const mergeStaged = Boolean(options.mergeStaged);
    const publishStaged = Boolean(options.publishStaged);

    return await this.operationCoordinator.runExclusive("local-db-index", async () => {
      const databaseRootPath = this.localDatabaseService.getStoredRootPath();
      log.info(`[Index] execute started rootPath=${databaseRootPath || "<empty>"}`);
      const databaseStatus = await this.localDatabaseService.ensureReady(databaseRootPath);
      log.info(
        `[Index] database status initialized=${Boolean(databaseStatus?.initialized)} rootPath=${databaseStatus?.rootPath || "<empty>"}`
      );

      if (!databaseStatus.initialized) {
        throw new Error(localDbMessages.databaseNotInitialized);
      }

      const paths = new LocalDatabasePaths(databaseRootPath);
      const documentFiles = await this.jsonLinesRepository.listFiles(paths.documentsDir, ".jsonl");
      const hasExistingIndexes = await this.hasPublishedIndexes(paths);
      const previousState = await this.stateRepository.readIndexState(paths);
      const databaseMeta = await this.stateRepository.readJson(paths.databaseMetaPath, null);
      const existingBucketStats = await this.stateRepository.readIndexBucketStats(paths);
      const activeBucketLayouts = hasExistingIndexes
        ? normalizeBucketLayoutMap(databaseMeta?.indexes || {})
        : buildRecommendedBucketLayoutMap();
      log.info(
        `[Index] discovered documentFiles=${documentFiles.length} previousStatus=${previousState?.status || "<none>"} documentsDir=${paths.documentsDir}`
      );

      if (documentFiles.length === 0) {
        throw new Error(localDbMessages.noIndexedDocuments);
      }

      if ([stageOnly, mergeStaged, publishStaged].filter(Boolean).length > 1) {
        throw new Error("Choose only one staged indexing operation.");
      }

      const buildToken = {
        cancelled: false,
        reason: null,
      };
      this.currentBuildToken = buildToken;

      try {
        if (mergeStaged) {
          return await this.mergeStagedIndexes({
            progress,
            paths,
            documentFiles,
            previousState,
            buildToken,
          });
        }

        if (publishStaged) {
          return await this.publishStagedCheckpoint({
            progress,
            paths,
            documentFiles,
            previousState,
            buildToken,
          });
        }

        return await this.runBuild({
          options,
          progress,
          workerCount,
          stageOnly,
          paths,
          documentFiles,
          previousState,
          activeBucketLayouts,
          existingBucketStats,
          hasExistingIndexes,
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

  async runBuild({
    options,
    progress,
    workerCount,
    stageOnly,
    paths,
    documentFiles,
    previousState,
    activeBucketLayouts,
    existingBucketStats,
    hasExistingIndexes,
    buildToken,
  }) {
    this.assertStagedSessionMode(previousState, { stageOnly });

    const resumableSession = await this.tryCreateResumeSession({
      paths,
      documentFiles,
      previousState,
    });

    if (resumableSession) {
      const canPublishPartially = this.shouldPublishPartiallyDuringResume(
        previousState,
        hasExistingIndexes
      );
      return await this.resumeBuild({
        options,
        progress,
        workerCount,
        stageOnly,
        paths,
        summary: resumableSession.summary,
        filePlans: resumableSession.filePlans,
        workingIndexesDir: resumableSession.workingIndexesDir,
        backupIndexesDir: resumableSession.backupIndexesDir,
        canPublishPartially,
        activeBucketLayouts,
        activeBucketStats: this.createWorkingBucketStats({
          buildMode: previousState?.buildMode || "full",
          hasExistingIndexes,
          existingBucketStats,
        }),
        buildToken,
      });
    }

    const buildPlan = await this.indexBuildPlanner.createPlan({
      paths,
      documentFiles,
      previousState,
    });
    log.info(
      `[Index] build plan mode=${buildPlan.mode} reason=${buildPlan.reason} filesTotal=${buildPlan.filesTotal} documentsTotal=${buildPlan.documentsTotal}`
    );

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
      stageOnly,
      workerCount,
      workingIndexesDir,
      backupIndexesDir,
      filePlans: buildPlan.filePlans,
      activeBucketLayouts,
    });

    await this.jsonLinesRepository.remove(workingIndexesDir);
    await this.prepareWorkingIndexes(paths, workingIndexesDir, buildPlan.mode);
    await this.stateRepository.writeIndexState(paths, summary);
    log.info(
      `[Index] session created buildId=${buildId} workingIndexesDir=${workingIndexesDir} backupIndexesDir=${backupIndexesDir}`
    );

    progress.emit("started", this.buildStartedPayload(summary));

    return await this.processFilePlans({
      options,
      progress,
      workerCount,
      stageOnly,
      paths,
      summary,
      filePlans: buildPlan.filePlans,
      workingIndexesDir,
      backupIndexesDir,
      activeBucketLayouts,
      activeBucketStats: this.createWorkingBucketStats({
        buildMode: buildPlan.mode,
        hasExistingIndexes,
        existingBucketStats,
      }),
      canPublishPartially: buildPlan.mode === "incremental" || !hasExistingIndexes,
      buildToken,
    });
  }

  async tryCreateResumeSession({ paths, documentFiles, previousState }) {
    if (!previousState?.session?.resumable) return null;
    if (!["cancelled", "running"].includes(previousState.status)) return null;
    if (Number(previousState.lookupFormatVersion || 1) !== DOCUMENT_LOOKUP_FORMAT_VERSION) {
      await this.cleanupAbandonedSession(paths, previousState);
      return null;
    }

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
    options,
    progress,
    workerCount,
    stageOnly,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    activeBucketLayouts,
    activeBucketStats,
    canPublishPartially,
    buildToken,
  }) {
    summary.workerCount = workerCount;
    await this.stateRepository.writeIndexState(paths, summary);
    progress.emit("started", this.buildStartedPayload(summary));

    return await this.processFilePlans({
      options,
      progress,
      workerCount,
      stageOnly,
      paths,
      summary,
      filePlans,
      workingIndexesDir,
      backupIndexesDir,
      activeBucketLayouts,
      activeBucketStats,
      canPublishPartially,
      buildToken,
    });
  }

  createRunningSummary({
    buildPlan,
    buildId,
    startedAt,
    stageOnly,
    workerCount,
    workingIndexesDir,
    backupIndexesDir,
    filePlans,
    activeBucketLayouts,
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
      lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
      bucketLayoutVersion: resolveGlobalBucketLayoutVersion(activeBucketLayouts),
      bucketLayouts: activeBucketLayouts,
      reusedFiles: buildPlan.reusedFiles,
      reusedDocuments: buildPlan.reusedDocuments,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      completedAt: null,
      error: null,
      workerCount,
      activeFiles: [],
      fileManifest: buildPlan.fileManifest,
      fields: Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
      session: {
        resumable: true,
        stagedOnly: Boolean(stageOnly),
        buildId,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
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
      filesTotal: Number(previousState.filesTotal || previousState.documentFiles?.length || 0),
      documentsTotal: Number(
        previousState.documentsTotal || previousState.indexedDocuments || resumePlan.documentsTotal
      ),
      lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
      bucketLayoutVersion:
        Number(previousState.bucketLayoutVersion || previousState.lookupFormatVersion) ||
        LEGACY_INDEX_BUCKET_LAYOUT_VERSION,
      bucketLayouts: previousState.bucketLayouts || null,
      workerCount: Number(previousState.workerCount || 1),
      activeFiles: [],
      session: {
        ...previousState.session,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
        pendingFiles: resumePlan.filePlans.map((plan) => plan.fileName),
      },
    };
  }

  async completeWithoutChanges(paths, previousState, buildPlan, progress) {
    const completedAt = new Date().toISOString();
    const previousFields =
      previousState?.fields ||
      Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0]));
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
      indexedDocuments: Number(previousState?.indexedDocuments || 0),
      documentsTotal: Number(previousState?.documentsTotal || previousState?.indexedDocuments || 0),
      indexedEntries: Number(previousState?.indexedEntries || 0),
      lookupEntries: Number(previousState?.lookupEntries || 0),
      lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
      reusedFiles: buildPlan.reusedFiles,
      reusedDocuments: buildPlan.reusedDocuments,
      fileManifest: buildPlan.fileManifest,
      fields: Object.fromEntries(
        INDEXABLE_FIELDS.map((field) => [field, Number(previousFields[field] || 0)])
      ),
      session: null,
    };

    await this.stateRepository.writeIndexState(paths, summary);
    log.info(`[Index] noop completed reason=${buildPlan.reason}`);
    progress.emit("started", this.buildStartedPayload(summary));
    progress.emit("completed", this.buildCompletedPayload(summary));
    return summary;
  }

  async processFilePlans({
    progress,
    workerCount,
    stageOnly,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    activeBucketLayouts,
    activeBucketStats,
    canPublishPartially,
    buildToken,
  }) {
    try {
      const effectiveWorkerCount = this.normalizeWorkerCount(workerCount);
      if (effectiveWorkerCount <= 1 || filePlans.length <= 1) {
        return await this.processFilePlansSequential({
          progress,
          stageOnly,
          paths,
          summary,
          filePlans,
          workingIndexesDir,
          backupIndexesDir,
          activeBucketLayouts,
          activeBucketStats,
          canPublishPartially,
          buildToken,
        });
      }

      return await this.processFilePlansParallel({
        progress,
        workerCount: effectiveWorkerCount,
        stageOnly,
        paths,
        summary,
        filePlans,
        workingIndexesDir,
        backupIndexesDir,
        activeBucketLayouts,
        activeBucketStats,
        canPublishPartially,
        buildToken,
      });
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

  async processFilePlansSequential({
    progress,
    stageOnly,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    activeBucketLayouts,
    activeBucketStats,
    canPublishPartially,
    buildToken,
  }) {
    for (const filePlan of filePlans) {
      this.throwIfCancelled(buildToken);

      summary.currentFile = filePlan.fileName;
      summary.currentFileDocumentsProcessed = 0;
      summary.currentFileDocumentsTotal = 0;
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
          activeBucketLayouts,
          activeBucketStats,
          summary,
          progress,
          buildToken,
        });

        if (!stageOnly) {
          await this.mergeIndexedFile(paths, fileWorkDir, workingIndexesDir);
          await this.publishIndexedFileAfterCommit(
            paths,
            fileWorkDir,
            canPublishPartially
          );
          await this.jsonLinesRepository.remove(fileWorkDir);
        }
        this.commitFileResult(summary, filePlan, fileResult);
        await this.stateRepository.writeIndexState(paths, summary);
        log.info(
          `[Index] file committed file=${filePlan.fileName} filesProcessed=${summary.filesProcessed}/${summary.filesTotal} indexedDocuments=${summary.indexedDocuments}`
        );
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

    if (stageOnly) {
      return await this.completeStagedBuild(paths, summary, progress, activeBucketStats);
    }

    await this.replaceIndexesAtomically(paths, workingIndexesDir, backupIndexesDir);
    return await this.completeBuild(
      paths,
      summary,
      progress,
      activeBucketLayouts,
      activeBucketStats
    );
  }

  async processFilePlansParallel({
    progress,
    workerCount,
    stageOnly,
    paths,
    summary,
    filePlans,
    workingIndexesDir,
    backupIndexesDir,
    activeBucketLayouts,
    activeBucketStats,
    canPublishPartially,
    buildToken,
  }) {
    let nextFileIndex = 0;
    let fatalError = null;
    const activeFiles = new Set();
    const aggregateProgress = new Map();
    let commitChain = Promise.resolve();

    const emitAggregateProgress = async (filePlan, fileDocumentsProcessed, fileResult) => {
      aggregateProgress.set(filePlan.fileName, {
        indexedDocuments: fileResult.indexedDocuments,
        indexedEntries: fileResult.indexedEntries,
      });
      summary.currentFile = filePlan.fileName;
      summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
      summary.currentFileDocumentsTotal = Math.max(
        filePlan.documentsTotal || 0,
        fileResult.indexedDocuments
      );
      summary.activeFiles = [...activeFiles];
      progress.emit("progress", {
        currentFile: filePlan.fileName,
        activeFiles: summary.activeFiles,
        filesProcessed: summary.filesProcessed,
        filesTotal: summary.filesTotal,
        indexedDocuments:
          summary.indexedDocuments +
          [...aggregateProgress.values()].reduce(
            (total, entry) => total + Number(entry.indexedDocuments || 0),
            0
          ),
        documentsTotal: summary.documentsTotal,
        indexedEntries:
          summary.indexedEntries +
          [...aggregateProgress.values()].reduce(
            (total, entry) => total + Number(entry.indexedEntries || 0),
            0
          ),
        fileDocumentsProcessed,
        fileDocumentsTotal: summary.currentFileDocumentsTotal,
        buildMode: summary.buildMode,
        workerCount: summary.workerCount || workerCount,
        resumable: Boolean(summary.session?.resumable),
      });
    };

    const commitIndexedFile = async (filePlan, fileWorkDir, fileResult) => {
      if (!stageOnly) {
        await this.mergeIndexedFile(paths, fileWorkDir, workingIndexesDir);
        await this.publishIndexedFileAfterCommit(paths, fileWorkDir, canPublishPartially);
        await this.jsonLinesRepository.remove(fileWorkDir);
      }
      this.commitFileResult(summary, filePlan, fileResult);
      summary.activeFiles = [...activeFiles];
      await this.stateRepository.writeIndexState(paths, summary);
      log.info(
        `[Index] file committed file=${filePlan.fileName} filesProcessed=${summary.filesProcessed}/${summary.filesTotal} indexedDocuments=${summary.indexedDocuments}`
      );
      progress.emit("file-completed", this.buildFileCompletedPayload(summary, filePlan));
    };

    const runWorker = async () => {
      while (true) {
        if (fatalError) return;

        const currentIndex = nextFileIndex;
        nextFileIndex += 1;
        if (currentIndex >= filePlans.length) {
          return;
        }

        const filePlan = filePlans[currentIndex];
        const fileWorkDir = this.getFileWorkDir(paths, summary, filePlan.fileName);
        activeFiles.add(filePlan.fileName);
        summary.activeFiles = [...activeFiles];

        await this.jsonLinesRepository.remove(fileWorkDir);
        await this.prepareIndexDirectories(paths, fileWorkDir);

        try {
          const fileResult = await this.indexDocumentFile({
            filePath: filePlan.filePath,
            filePlan,
            paths,
            indexesDir: fileWorkDir,
            activeBucketLayouts,
            activeBucketStats,
            summary: null,
            progress: null,
            buildToken,
            onFileProgress: async ({ fileDocumentsProcessed, fileResult: currentFileResult }) => {
              await emitAggregateProgress(filePlan, fileDocumentsProcessed, currentFileResult);
            },
          });

          commitChain = commitChain.then(() =>
            commitIndexedFile(filePlan, fileWorkDir, fileResult)
          );
          await commitChain;
        } catch (error) {
          await this.jsonLinesRepository.remove(fileWorkDir);
          if (!fatalError) {
            fatalError = error;
            if (!(error instanceof IndexBuildCancelledError)) {
              buildToken.cancelled = true;
              buildToken.reason = buildToken.reason || "worker-error";
            }
          }
        } finally {
          activeFiles.delete(filePlan.fileName);
          aggregateProgress.delete(filePlan.fileName);
          summary.activeFiles = [...activeFiles];
        }
      }
    };

    const workers = Array.from({ length: Math.min(workerCount, filePlans.length) }, () =>
      runWorker()
    );
    await Promise.all(workers);
    await commitChain;

    if (fatalError) {
      if (fatalError instanceof IndexBuildCancelledError) {
        return await this.handleCancellation({
          error: fatalError,
          progress,
          paths,
          summary,
          activeFiles: [...activeFiles],
        });
      }
      throw fatalError;
    }

    if (stageOnly) {
      return await this.completeStagedBuild(paths, summary, progress, activeBucketStats);
    }

    await this.replaceIndexesAtomically(paths, workingIndexesDir, backupIndexesDir);
    return await this.completeBuild(
      paths,
      summary,
      progress,
      activeBucketLayouts,
      activeBucketStats
    );
  }

  async completeBuild(paths, summary, progress, activeBucketLayouts, activeBucketStats) {
    summary.status = "completed";
    summary.currentFile = null;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = 0;
    summary.documentsTotal = summary.indexedDocuments;
    summary.completedAt = new Date().toISOString();
    summary.error = null;
    summary.session = null;

    await this.stateRepository.writeIndexState(paths, summary);
    await this.stateRepository.writeIndexBucketStats(
      paths,
      this.buildPersistedBucketStats(activeBucketStats, summary.completedAt)
    );
    await this.stateRepository.updateDatabaseMeta(paths, (meta) => ({
      ...meta,
      updatedAt: summary.completedAt,
      indexes: {
        ...(meta.indexes || {}),
        version: 1,
        builtAt: summary.completedAt,
        partial: false,
        publishedFiles: summary.filesProcessed,
        fields: INDEXABLE_FIELDS,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
        bucketLayoutVersion: resolveGlobalBucketLayoutVersion(activeBucketLayouts),
        bucketLayouts: activeBucketLayouts,
      },
    }));
    log.info(
      `[Index] completed buildMode=${summary.buildMode} filesProcessed=${summary.filesProcessed} indexedDocuments=${summary.indexedDocuments} indexesDir=${paths.indexesDir}`
    );
    progress.emit("completed", this.buildCompletedPayload(summary));

    return summary;
  }

  async completeStagedBuild(paths, summary, progress, activeBucketStats) {
    const completedAt = new Date().toISOString();
    summary.status = "staged";
    summary.currentFile = null;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = 0;
    summary.documentsTotal = summary.indexedDocuments;
    summary.completedAt = completedAt;
    summary.error = null;
    summary.session = {
      ...(summary.session || {}),
      stagedOnly: true,
      bucketStatsPath: this.getStagedBucketStatsPath(paths, summary.session?.buildId),
    };

    await this.stateRepository.writeJson(
      summary.session.bucketStatsPath,
      this.buildPersistedBucketStats(activeBucketStats, completedAt)
    );
    await this.stateRepository.writeIndexState(paths, summary);
    progress.emit("staged", {
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      indexedDocuments: summary.indexedDocuments,
      indexedEntries: summary.indexedEntries,
      buildMode: summary.buildMode,
      workerCount: summary.workerCount || 1,
      resumable: Boolean(summary.session?.resumable),
    });

    return summary;
  }

  async mergeStagedIndexes({ progress, paths, documentFiles, previousState, buildToken }) {
    if (previousState?.status !== "staged" || !previousState?.session?.stagedOnly) {
      throw new Error("No staged file indexes found to merge.");
    }

    const completedFiles = previousState.session.completedFiles || [];
    if (completedFiles.length === 0) {
      throw new Error("No staged file indexes found to merge.");
    }

    const manifestMatches = await this.isStateManifestCurrent(paths, documentFiles, previousState);
    if (!manifestMatches) {
      throw new Error(
        "Document files changed after staged indexing. Rebuild staged indexes from scratch before merging."
      );
    }

    const mergedIndexesDir = paths.getTempPath(
      `${INDEX_BUILD_TEMP_PREFIX}-${previousState.session.buildId}-merged`
    );
    const backupIndexesDir = paths.getTempPath(
      `${INDEX_BACKUP_TEMP_PREFIX}-${previousState.session.buildId}-merge`
    );
    await this.jsonLinesRepository.remove(mergedIndexesDir);
    await this.prepareIndexDirectories(paths, mergedIndexesDir);

    progress.emit("started", {
      filesProcessed: 0,
      filesTotal: completedFiles.length,
      indexedDocuments: previousState.indexedDocuments,
      documentsTotal: previousState.documentsTotal,
      buildMode: previousState.buildMode,
      workerCount: 1,
      resumable: false,
      mergeStaged: true,
    });

    let filesProcessed = 0;
    try {
      for (const fileName of completedFiles) {
        this.throwIfCancelled(buildToken);
        const fileWorkDir = this.getFileWorkDir(paths, previousState, fileName);
        if (!(await this.jsonLinesRepository.exists(fileWorkDir))) {
          throw new Error(`Staged index data is missing for file: ${fileName}`);
        }

        await this.mergeIndexedFile(paths, fileWorkDir, mergedIndexesDir);
        filesProcessed += 1;
        progress.emit("progress", {
          currentFile: fileName,
          filesProcessed,
          filesTotal: completedFiles.length,
          indexedDocuments: previousState.indexedDocuments,
          documentsTotal: previousState.documentsTotal,
          buildMode: previousState.buildMode,
          workerCount: 1,
          resumable: false,
          mergeStaged: true,
        });
      }
    } catch (error) {
      await this.jsonLinesRepository.remove(mergedIndexesDir);
      if (error instanceof IndexBuildCancelledError) {
        return await this.handleMergeStagedCancellation({
          error,
          progress,
          paths,
          previousState,
          filesProcessed,
        });
      }
      throw error;
    }

    await this.replaceIndexesAtomically(paths, mergedIndexesDir, backupIndexesDir);
    const bucketStats = await this.stateRepository.readJson(
      previousState.session.bucketStatsPath,
      null
    );
    if (bucketStats) {
      await this.stateRepository.writeIndexBucketStats(paths, bucketStats);
    }

    const completedAt = new Date().toISOString();
    const bucketLayouts = previousState.bucketLayouts || buildRecommendedBucketLayoutMap();
    const summary = {
      ...previousState,
      status: "completed",
      resumedAt: null,
      completedAt,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      documentsTotal: previousState.indexedDocuments,
      error: null,
      session: null,
    };

    await this.stateRepository.updateDatabaseMeta(paths, (meta) => ({
      ...meta,
      updatedAt: completedAt,
      indexes: {
        ...(meta.indexes || {}),
        version: 1,
        builtAt: completedAt,
        partial: false,
        publishedFiles: previousState.filesProcessed,
        fields: INDEXABLE_FIELDS,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
        bucketLayoutVersion: resolveGlobalBucketLayoutVersion(bucketLayouts),
        bucketLayouts,
      },
    }));
    await this.stateRepository.writeIndexState(paths, summary);
    await this.cleanupStagedArtifacts(paths, previousState);
    progress.emit("completed", this.buildCompletedPayload(summary));
    return summary;
  }

  async publishStagedCheckpoint({ progress, paths, documentFiles, previousState, buildToken }) {
    if (
      !["cancelled", "publishing"].includes(previousState?.status) ||
      !previousState?.session?.stagedOnly ||
      !previousState?.session?.resumable
    ) {
      throw new Error("No interrupted staged indexing session found to publish.");
    }

    const completedFiles = previousState.session.completedFiles || [];
    if (completedFiles.length === 0) {
      throw new Error("No completed staged file indexes found to publish.");
    }

    const manifestMatches = await this.isStateManifestCurrent(paths, documentFiles, previousState);
    if (!manifestMatches) {
      throw new Error(
        "Document files changed after staged indexing. Resume or rebuild staged indexes before publishing."
      );
    }

    const checkpointIndexesDir = paths.getTempPath(
      `${INDEX_BUILD_TEMP_PREFIX}-${previousState.session.buildId}-checkpoint`
    );
    const backupIndexesDir = paths.getTempPath(
      `${INDEX_BACKUP_TEMP_PREFIX}-${previousState.session.buildId}-checkpoint`
    );
    const journalPath = paths.getTempPath(
      `${INDEX_BUILD_TEMP_PREFIX}-${previousState.session.buildId}-checkpoint-journal.json`
    );
    const savedCheckpoint = previousState.session.checkpointPublish;
    const canResumeCheckpoint =
      savedCheckpoint?.workingIndexesDir === checkpointIndexesDir &&
      (await this.jsonLinesRepository.exists(checkpointIndexesDir));
    let checkpointCompletedFiles = canResumeCheckpoint
      ? [...(savedCheckpoint.completedFiles || [])]
      : [];

    if (canResumeCheckpoint) {
      await this.recoverCheckpointJournal({
        checkpointIndexesDir,
        journalPath,
        checkpointCompletedFiles,
      });
    } else {
      await this.jsonLinesRepository.remove(checkpointIndexesDir);
      await this.jsonLinesRepository.remove(journalPath);
      await this.prepareIndexDirectories(paths, checkpointIndexesDir);
    }

    const checkpointCompletedSet = new Set(checkpointCompletedFiles);
    const checkpointSummary = {
      ...previousState,
      status: "publishing",
      currentFile: null,
      activeFiles: [],
      error: null,
      session: {
        ...previousState.session,
        checkpointPublish: {
          status: "running",
          workingIndexesDir: checkpointIndexesDir,
          journalPath,
          filesProcessed: checkpointCompletedFiles.length,
          filesTotal: completedFiles.length,
          completedFiles: checkpointCompletedFiles,
          currentFile: canResumeCheckpoint ? savedCheckpoint?.currentFile || null : null,
          currentFilePartsProcessed: canResumeCheckpoint
            ? Number(savedCheckpoint?.currentFilePartsProcessed || 0)
            : 0,
          currentFilePartsTotal: canResumeCheckpoint
            ? Number(savedCheckpoint?.currentFilePartsTotal || 0)
            : 0,
          startedAt: savedCheckpoint?.startedAt || new Date().toISOString(),
          resumedAt: canResumeCheckpoint ? new Date().toISOString() : null,
        },
      },
    };
    await this.stateRepository.writeIndexState(paths, checkpointSummary);

    progress.emit("started", {
      filesProcessed: checkpointCompletedFiles.length,
      filesTotal: completedFiles.length,
      indexedDocuments: previousState.indexedDocuments,
      documentsTotal: previousState.documentsTotal,
      buildMode: previousState.buildMode,
      workerCount: 1,
      resumable: true,
      publishStaged: true,
    });

    let filesProcessed = checkpointCompletedFiles.length;
    try {
      for (const fileName of completedFiles) {
        if (checkpointCompletedSet.has(fileName)) continue;
        this.throwIfCancelled(buildToken);
        const fileWorkDir = this.getFileWorkDir(paths, previousState, fileName);
        if (!(await this.jsonLinesRepository.exists(fileWorkDir))) {
          throw new Error(`Staged index data is missing for file: ${fileName}`);
        }

        const mergePlan = await this.buildIndexedFileMergePlan(
          paths,
          fileWorkDir,
          checkpointIndexesDir
        );
        let partsProcessed =
          checkpointSummary.session.checkpointPublish.currentFile === fileName
            ? Number(checkpointSummary.session.checkpointPublish.currentFilePartsProcessed || 0)
            : 0;
        if (partsProcessed < 0 || partsProcessed > mergePlan.length) {
          partsProcessed = 0;
        }

        while (partsProcessed < mergePlan.length) {
          this.throwIfCancelled(buildToken);
          const batchEnd = Math.min(
            partsProcessed + CHECKPOINT_MERGE_BATCH_SIZE,
            mergePlan.length
          );
          const mergeBatch = mergePlan.slice(partsProcessed, batchEnd);
          await this.writeCheckpointJournal({
            checkpointIndexesDir,
            journalPath,
            fileName,
            mergePlan: mergeBatch,
          });
          checkpointSummary.session.checkpointPublish = {
            ...checkpointSummary.session.checkpointPublish,
            currentFile: fileName,
            currentFilePartsProcessed: partsProcessed,
            currentFilePartsTotal: mergePlan.length,
          };
          await this.stateRepository.writeIndexState(paths, checkpointSummary);

          await this.mergeIndexedFile(paths, fileWorkDir, checkpointIndexesDir, {
            mergePlan: mergeBatch,
          });
          partsProcessed = batchEnd;
          checkpointSummary.session.checkpointPublish.currentFilePartsProcessed = partsProcessed;
          await this.stateRepository.writeIndexState(paths, checkpointSummary);
          await this.jsonLinesRepository.remove(journalPath);
          progress.emit("progress", {
            currentFile: fileName,
            filesProcessed,
            filesTotal: completedFiles.length,
            indexedDocuments: previousState.indexedDocuments,
            documentsTotal: previousState.documentsTotal,
            buildMode: previousState.buildMode,
            workerCount: 1,
            resumable: true,
            publishStaged: true,
            partsProcessed,
            partsTotal: mergePlan.length,
          });
        }
        filesProcessed += 1;
        checkpointCompletedFiles = [...checkpointCompletedFiles, fileName];
        checkpointCompletedSet.add(fileName);
        checkpointSummary.session.checkpointPublish = {
          ...checkpointSummary.session.checkpointPublish,
          filesProcessed,
          completedFiles: checkpointCompletedFiles,
          currentFile: null,
          currentFilePartsProcessed: 0,
          currentFilePartsTotal: 0,
        };
        await this.stateRepository.writeIndexState(paths, checkpointSummary);
        await this.jsonLinesRepository.remove(journalPath);
        progress.emit("progress", {
          currentFile: fileName,
          filesProcessed,
          filesTotal: completedFiles.length,
          indexedDocuments: previousState.indexedDocuments,
          documentsTotal: previousState.documentsTotal,
          buildMode: previousState.buildMode,
          workerCount: 1,
          resumable: true,
          publishStaged: true,
        });
      }
    } catch (error) {
      await this.recoverCheckpointJournal({
        checkpointIndexesDir,
        journalPath,
        checkpointCompletedFiles,
      });
      checkpointSummary.status = "cancelled";
      checkpointSummary.completedAt = new Date().toISOString();
      checkpointSummary.error = error instanceof IndexBuildCancelledError ? null : error.message;
      checkpointSummary.session.checkpointPublish = {
        ...checkpointSummary.session.checkpointPublish,
        status: "cancelled",
        filesProcessed,
        completedFiles: checkpointCompletedFiles,
      };
      await this.stateRepository.writeIndexState(paths, checkpointSummary);
      if (error instanceof IndexBuildCancelledError) {
        progress.emit("cancelled", {
          filesProcessed,
          filesTotal: completedFiles.length,
          indexedDocuments: previousState.indexedDocuments,
          documentsTotal: previousState.documentsTotal,
          buildMode: previousState.buildMode,
          reason: error.reason,
          publishStaged: true,
        });
        return checkpointSummary;
      }
      throw error;
    }

    await this.replaceIndexesAtomically(paths, checkpointIndexesDir, backupIndexesDir);
    await this.jsonLinesRepository.remove(paths.indexBucketStatsPath);

    const publishedAt = new Date().toISOString();
    const bucketLayouts = previousState.bucketLayouts || buildRecommendedBucketLayoutMap();
    const summary = {
      ...previousState,
      status: "cancelled",
      completedAt: publishedAt,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
      activeFiles: [],
      error: null,
      session: {
        ...previousState.session,
        checkpointPublishedAt: publishedAt,
        checkpointPublishedFiles: completedFiles.length,
        checkpointPublish: null,
      },
    };

    await this.stateRepository.updateDatabaseMeta(paths, (meta) => ({
      ...meta,
      updatedAt: publishedAt,
      indexes: {
        ...(meta.indexes || {}),
        version: 1,
        builtAt: publishedAt,
        partial: true,
        publishedFiles: completedFiles.length,
        fields: INDEXABLE_FIELDS,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
        bucketLayoutVersion: resolveGlobalBucketLayoutVersion(bucketLayouts),
        bucketLayouts,
      },
    }));
    await this.stateRepository.writeIndexState(paths, summary);
    progress.emit("published", {
      filesProcessed: completedFiles.length,
      filesTotal: completedFiles.length,
      indexedDocuments: previousState.indexedDocuments,
      documentsTotal: previousState.documentsTotal,
      buildMode: previousState.buildMode,
      resumable: true,
      publishStaged: true,
    });
    return summary;
  }

  async writeCheckpointJournal({ checkpointIndexesDir, journalPath, fileName, mergePlan }) {
    const targetSizes = [];
    const seenTargets = new Set();
    for (const { targetPath } of mergePlan) {
      if (seenTargets.has(targetPath)) continue;
      seenTargets.add(targetPath);

      let previousSize = null;
      try {
        previousSize = Number((await this.jsonLinesRepository.stat(targetPath)).size);
      } catch {
        previousSize = null;
      }
      targetSizes.push({
        relativePath: path.relative(checkpointIndexesDir, targetPath),
        previousSize,
      });
    }

    await this.stateRepository.writeJson(journalPath, {
      fileName,
      targetSizes,
    });
  }

  async recoverCheckpointJournal({ checkpointIndexesDir, journalPath, checkpointCompletedFiles }) {
    const journal = await this.stateRepository.readJson(journalPath, null);
    if (!journal) return;

    if ((checkpointCompletedFiles || []).includes(journal.fileName)) {
      await this.jsonLinesRepository.remove(journalPath);
      return;
    }

    const checkpointRoot = path.resolve(checkpointIndexesDir);
    for (const target of journal.targetSizes || []) {
      const targetPath = path.resolve(checkpointIndexesDir, target.relativePath);
      if (
        targetPath !== checkpointRoot &&
        !targetPath.startsWith(`${checkpointRoot}${path.sep}`)
      ) {
        throw new Error(`Unsafe checkpoint journal path: ${target.relativePath}`);
      }

      if (target.previousSize === null) {
        await this.jsonLinesRepository.remove(targetPath);
      } else if (await this.jsonLinesRepository.exists(targetPath)) {
        await this.jsonLinesRepository.truncate(targetPath, Number(target.previousSize));
      }
    }
    await this.jsonLinesRepository.remove(journalPath);
  }

  async handleMergeStagedCancellation({
    error,
    progress,
    paths,
    previousState,
    filesProcessed,
  }) {
    const cancelledAt = new Date().toISOString();
    const summary = {
      ...previousState,
      status: "cancelled",
      completedAt: cancelledAt,
      error: null,
      currentFile: null,
      currentFileDocumentsProcessed: 0,
      currentFileDocumentsTotal: 0,
    };

    await this.stateRepository.writeIndexState(paths, summary);
    log.warn(
      `[Index] merge-staged cancelled filesProcessed=${filesProcessed}/${previousState.filesProcessed || previousState.filesTotal || 0} reason=${error.reason || "cancelled"}`
    );
    progress.emit("cancelled", {
      filesProcessed,
      filesTotal: previousState.filesProcessed || previousState.filesTotal || 0,
      indexedDocuments: previousState.indexedDocuments,
      documentsTotal: previousState.documentsTotal,
      buildMode: previousState.buildMode,
      reason: error.reason,
      mergeStaged: true,
    });

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
    log.error(
      `[Index] failed buildMode=${summary.buildMode} filesProcessed=${summary.filesProcessed} currentFile=${summary.currentFile || "<none>"}`
    );
    progress.emit("failed", {
      error: error.message,
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      buildMode: summary.buildMode,
    });
    throw error;
  }

  async publishIndexedFileAfterCommit(paths, fileWorkDir, canPublishPartially) {
    if (!canPublishPartially) {
      return;
    }

    await this.mergeIndexedFile(paths, fileWorkDir, paths.indexesDir);
  }

  getStagedBucketStatsPath(paths, buildId) {
    return paths.getTempPath(`${INDEX_BUILD_TEMP_PREFIX}-${buildId}-bucket-stats.json`);
  }

  shouldPublishPartiallyDuringResume(previousState, hasExistingIndexes) {
    if (!previousState) {
      return !hasExistingIndexes;
    }

    if (previousState.buildMode === "incremental") {
      return true;
    }

    return previousState.buildReason === "initial-build";
  }

  assertStagedSessionMode(previousState, { stageOnly }) {
    if (!previousState?.session?.stagedOnly) {
      return;
    }

    if (["running", "cancelled"].includes(previousState.status) && !stageOnly) {
      throw new Error(
        "A staged-only indexing session already exists. Resume it with --stage-only or clear temp/index state before starting a normal build."
      );
    }

    if (previousState.status === "staged") {
      if (stageOnly) {
        throw new Error(
          "Staged file indexes are already ready. Run --merge-staged to publish them or use --clean to rebuild from scratch."
        );
      }

      throw new Error(
        "Unmerged staged file indexes already exist. Run --merge-staged to publish them or use --clean to rebuild from scratch."
      );
    }
  }

  async isStateManifestCurrent(paths, documentFiles, previousState) {
    const snapshots = await this.indexBuildPlanner.readFileSnapshots(paths, documentFiles);
    const previousManifest = this.indexBuildPlanner.normalizeManifest(previousState?.fileManifest);
    const currentManifest = new Map(
      Object.entries(this.indexBuildPlanner.buildManifestFromPlans(snapshots))
    );

    return this.indexBuildPlanner.areManifestEntriesEqual(previousManifest, currentManifest);
  }

  async handleCancellation({ error, progress, paths, summary, filePlan = null, activeFiles = [] }) {
    summary.status = "cancelled";
    summary.error = null;
    summary.completedAt = new Date().toISOString();
    summary.currentFile = filePlan?.fileName || activeFiles[0] || summary.currentFile;
    summary.currentFileDocumentsProcessed = 0;
    summary.currentFileDocumentsTotal = 0;
    summary.activeFiles = activeFiles;
    if (summary.session) {
      const pendingFiles = new Set(summary.session.pendingFiles || []);
      const completedFiles = new Set(summary.session.completedFiles || []);
      if (summary.currentFile && !completedFiles.has(summary.currentFile)) {
        pendingFiles.add(summary.currentFile);
      }
      for (const activeFile of activeFiles) {
        if (!completedFiles.has(activeFile)) {
          pendingFiles.add(activeFile);
        }
      }
      summary.session.pendingFiles = [...pendingFiles];
    }

    await this.stateRepository.writeIndexState(paths, summary);
    log.warn(
      `[Index] cancelled buildMode=${summary.buildMode} currentFile=${summary.currentFile || "<none>"} filesProcessed=${summary.filesProcessed}/${summary.filesTotal} reason=${error.reason || "cancelled"}`
    );
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
    activeBucketLayouts,
    activeBucketStats,
    summary,
    progress,
    buildToken,
    onFileProgress = null,
  }) {
    const bufferMap = new Map();
    let documentsSinceLastSave = 0;
    let documentsSinceLastProgress = 0;
    let fileDocumentsProcessed = 0;
    const fileResult = {
      indexedDocuments: 0,
      indexedEntries: 0,
      lookupEntries: 0,
      fields: Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
    };

    try {
      for await (const indexedDocument of this.jsonLinesRepository.iterateJsonWithMetadata(filePath)) {
        this.throwIfCancelled(buildToken);
        const document = indexedDocument.value;

        fileDocumentsProcessed += 1;
        documentsSinceLastSave += 1;
        documentsSinceLastProgress += 1;
        fileResult.indexedDocuments += 1;

        await this.bufferDocumentLookup(
          paths,
          indexesDir,
          filePlan.fileName,
          document,
          indexedDocument,
          bufferMap,
          fileResult,
          activeBucketStats
        );
        await this.bufferFieldIndexes(
          paths,
          indexesDir,
          document,
          bufferMap,
          fileResult,
          activeBucketLayouts,
          activeBucketStats
        );

        if (documentsSinceLastSave >= PROGRESS_SAVE_INTERVAL) {
          await this.flushAllBuffers(bufferMap);
          if (summary) {
            summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
            await this.stateRepository.writeIndexState(paths, summary);
          }
          documentsSinceLastSave = 0;
        }

        if (documentsSinceLastProgress >= PROGRESS_EMIT_INTERVAL && summary && progress) {
          summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
          progress.emit("progress", this.buildProgressPayload(summary, filePlan, fileResult));
          documentsSinceLastProgress = 0;
        } else if (documentsSinceLastProgress >= PROGRESS_EMIT_INTERVAL && onFileProgress) {
          await onFileProgress({
            fileDocumentsProcessed,
            fileResult,
          });
          documentsSinceLastProgress = 0;
        }
      }
    } finally {
      await this.flushAllBuffers(bufferMap);
    }

    if (summary && progress) {
      summary.currentFileDocumentsProcessed = fileDocumentsProcessed;
      progress.emit("progress", this.buildProgressPayload(summary, filePlan, fileResult));
    } else if (onFileProgress) {
      await onFileProgress({
        fileDocumentsProcessed,
        fileResult,
      });
    }
    return fileResult;
  }

  async bufferFieldIndexes(
    paths,
    indexesDir,
    document,
    bufferMap,
    fileResult,
    activeBucketLayouts,
    activeBucketStats
  ) {
    for (const field of INDEXABLE_FIELDS) {
      const terms = this.collectDocumentIndexTerms(document, field);
      for (const term of terms) {
        const bucket = this.termService.getIndexBucketName(
          field,
          term,
          activeBucketLayouts[field] || LEGACY_INDEX_BUCKET_LAYOUT_VERSION
        );
        const bucketFile = paths.getIndexBucketPath(field, bucket, indexesDir);
        const entry = JSON.stringify({
          term,
          docId: document.docId,
          sourceTable: document.sourceTable,
          rowId: document.rowId,
        });

        await this.pushBufferedLine(bufferMap, bucketFile, entry);
        this.incrementBucketStat(activeBucketStats.fields, field, bucket);
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

  async bufferDocumentLookup(
    paths,
    indexesDir,
    fileName,
    document,
    indexedDocument,
    bufferMap,
    fileResult,
    activeBucketStats
  ) {
    const lookupBucket = this.termService.getDocumentBucketName(document.docId);
    const lookupFile = paths.getDocumentLookupBucketPath(lookupBucket, indexesDir);
    const entry = JSON.stringify({
      docId: document.docId,
      fileName,
      byteOffset: indexedDocument.byteOffset,
      byteLength: indexedDocument.byteLength,
    });

    await this.pushBufferedLine(bufferMap, lookupFile, entry);
    this.incrementBucketStat(activeBucketStats.documentLookup, lookupBucket);
    fileResult.lookupEntries += 1;
  }

  createWorkingBucketStats({ buildMode, hasExistingIndexes, existingBucketStats }) {
    if (buildMode === "incremental" && hasExistingIndexes && existingBucketStats) {
      return this.cloneBucketStats(existingBucketStats);
    }

    return {
      fields: {},
      documentLookup: {},
    };
  }

  cloneBucketStats(existingBucketStats) {
    const fields = {};
    for (const [field, buckets] of Object.entries(existingBucketStats?.fields || {})) {
      fields[field] = { ...buckets };
    }

    return {
      fields,
      documentLookup: { ...(existingBucketStats?.documentLookup || {}) },
    };
  }

  incrementBucketStat(target, key, bucketName = null) {
    if (bucketName === null) {
      target[key] = Number(target[key] || 0) + 1;
      return;
    }

    const bucketMap = target[key] || {};
    bucketMap[bucketName] = Number(bucketMap[bucketName] || 0) + 1;
    target[key] = bucketMap;
  }

  buildPersistedBucketStats(activeBucketStats, builtAt) {
    return {
      builtAt,
      fields: activeBucketStats.fields,
      documentLookup: activeBucketStats.documentLookup,
    };
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
    bufferMap.delete(filePath);
  }

  async flushAllBuffers(bufferMap) {
    for (const filePath of bufferMap.keys()) {
      await this.flushBuffer(bufferMap, filePath);
    }
  }

  async buildIndexedFileMergePlan(paths, sourceIndexesDir, targetIndexesDir) {
    const mergePlan = [];
    for (const field of INDEXABLE_FIELDS) {
      const sourceFieldDir = paths.getIndexFieldDir(field, sourceIndexesDir);
      if (!(await this.jsonLinesRepository.exists(sourceFieldDir))) continue;

      const bucketFiles = await this.jsonLinesRepository.listFilesRecursive(
        sourceFieldDir,
        ".jsonl"
      );
      for (const bucketFile of bucketFiles) {
        const bucketName = path.basename(bucketFile, ".jsonl");
        const sourcePath = path.join(sourceFieldDir, bucketFile);
        const targetPath = paths.getIndexBucketPath(field, bucketName, targetIndexesDir);
        mergePlan.push({ sourcePath, targetPath });
      }
    }

    const sourceLookupDir = paths.getDocumentLookupDir(sourceIndexesDir);
    if (await this.jsonLinesRepository.exists(sourceLookupDir)) {
      const bucketFiles = await this.jsonLinesRepository.listFilesRecursive(sourceLookupDir, ".jsonl");
      for (const bucketFile of bucketFiles) {
        const sourcePath = path.join(sourceLookupDir, bucketFile);
        const targetPath = path.join(paths.getDocumentLookupDir(targetIndexesDir), bucketFile);
        mergePlan.push({ sourcePath, targetPath });
      }
    }
    return mergePlan;
  }

  async mergeIndexedFile(paths, sourceIndexesDir, targetIndexesDir, options = {}) {
    const mergePlan =
      options.mergePlan ||
      (await this.buildIndexedFileMergePlan(paths, sourceIndexesDir, targetIndexesDir));
    let partsProcessed = 0;
    for (const { sourcePath, targetPath } of mergePlan) {
      await this.copyJsonLines(sourcePath, targetPath);
      partsProcessed += 1;
      if (
        options.onProgress &&
        (partsProcessed % 1000 === 0 || partsProcessed === mergePlan.length)
      ) {
        options.onProgress({ partsProcessed, partsTotal: mergePlan.length });
      }
    }
  }

  async copyJsonLines(sourcePath, targetPath) {
    const lines = [];
    for await (const line of this.jsonLinesRepository.iterateLines(sourcePath)) {
      lines.push(line);
      if (lines.length >= BUFFER_FLUSH_SIZE) {
        await this.jsonLinesRepository.appendLines(targetPath, lines);
        lines.length = 0;
      }
    }

    if (lines.length > 0) {
      await this.jsonLinesRepository.appendLines(targetPath, lines);
    }
  }

  commitFileResult(summary, filePlan, fileResult) {
    summary.filesProcessed += 1;
    summary.indexedDocuments += fileResult.indexedDocuments;
    summary.documentsTotal += fileResult.indexedDocuments;
    summary.indexedEntries += fileResult.indexedEntries;
    summary.lookupEntries += fileResult.lookupEntries;
    summary.currentFile = filePlan.fileName;
    summary.currentFileDocumentsProcessed = fileResult.indexedDocuments;
    summary.currentFileDocumentsTotal = fileResult.indexedDocuments;
    filePlan.documentsTotal = fileResult.indexedDocuments;

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
      workerCount: summary.workerCount || 1,
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
      fileDocumentsTotal: Math.max(filePlan.documentsTotal || 0, fileResult.indexedDocuments),
      buildMode: summary.buildMode,
      workerCount: summary.workerCount || 1,
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
      fileDocumentsProcessed: filePlan.documentsTotal || summary.currentFileDocumentsProcessed,
      fileDocumentsTotal: filePlan.documentsTotal || summary.currentFileDocumentsTotal,
      buildMode: summary.buildMode,
      workerCount: summary.workerCount || 1,
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
      workerCount: summary.workerCount || 1,
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
    if ((summary.session.completedFiles || []).includes(summary.currentFile)) return;
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
    if (previousState?.session?.bucketStatsPath) {
      await this.jsonLinesRepository.remove(previousState.session.bucketStatsPath);
    }
    if (Array.isArray(previousState?.session?.completedFiles)) {
      for (const fileName of previousState.session.completedFiles) {
        await this.jsonLinesRepository.remove(this.getFileWorkDir(paths, previousState, fileName));
      }
    }
    await this.removeCurrentFileWorkDir(previousState, paths);
  }

  async cleanupStagedArtifacts(paths, previousState) {
    if (previousState?.session?.bucketStatsPath) {
      await this.jsonLinesRepository.remove(previousState.session.bucketStatsPath);
    }

    if (Array.isArray(previousState?.session?.completedFiles)) {
      for (const fileName of previousState.session.completedFiles) {
        await this.jsonLinesRepository.remove(this.getFileWorkDir(paths, previousState, fileName));
      }
    }

    if (previousState?.session?.workingIndexesDir) {
      await this.jsonLinesRepository.remove(previousState.session.workingIndexesDir);
    }
  }

  async hasPublishedIndexes(paths) {
    if (!(await this.jsonLinesRepository.exists(paths.indexesDir))) {
      return false;
    }

    for (const field of INDEXABLE_FIELDS) {
      const fieldDir = paths.getIndexFieldDir(field);
      if (!(await this.jsonLinesRepository.exists(fieldDir))) continue;
      if ((await this.jsonLinesRepository.listFilesRecursive(fieldDir, ".jsonl")).length > 0) {
        return true;
      }
    }

    const lookupDir = paths.getDocumentLookupDir();
    if (!(await this.jsonLinesRepository.exists(lookupDir))) {
      return false;
    }

    return (await this.jsonLinesRepository.listFilesRecursive(lookupDir, ".jsonl")).length > 0;
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

  normalizeWorkerCount(value) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return 1;
    }

    return Math.min(4, Math.max(1, Math.floor(numericValue)));
  }
}

const CHECKPOINT_MERGE_BATCH_SIZE = 1000;
