import path from "path";
import {
  DEFAULT_DOCUMENT_SEGMENT_SIZE_BYTES,
  IMPORT_PROGRESS_INTERVAL,
  IMPORT_WRITE_BATCH_SIZE,
  MAX_IMPORT_FILES,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";
import { ProgressReporter } from "../../localdb/ProgressReporter.js";

export class ImportLocalDatabaseUseCase {
  constructor({
    localDatabaseService,
    guard,
    stateRepository,
    jsonLinesRepository,
    operationCoordinator,
    documentFactory,
    importFileReader,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.guard = guard;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.operationCoordinator = operationCoordinator;
    this.documentFactory = documentFactory;
    this.importFileReader = importFileReader;
  }

  async execute(folderPath, options = {}) {
    const progress = new ProgressReporter(options.onProgress);

    return await this.operationCoordinator.runExclusive("local-db-import", async () => {
      const databaseRootPath = this.localDatabaseService.getStoredRootPath();
      const databaseStatus = await this.localDatabaseService.ensureReady(databaseRootPath);

      if (!databaseStatus.initialized) {
        throw new Error(localDbMessages.databaseNotInitialized);
      }

      const checkedPaths = await this.guard.assertImportSourceAllowed(
        databaseRootPath,
        folderPath
      );
      const paths = new LocalDatabasePaths(checkedPaths.databaseRootPath);
      const jsonFiles = await this.jsonLinesRepository.listFiles(
        checkedPaths.sourceFolderPath,
        ".json"
      );

      if (jsonFiles.length === 0) {
        throw new Error(localDbMessages.noJsonFilesFound);
      }

      if (jsonFiles.length > MAX_IMPORT_FILES) {
        throw new Error(localDbMessages.tooManyImportFiles(MAX_IMPORT_FILES));
      }

      const filePlans = await this.buildFilePlans(checkedPaths.sourceFolderPath, jsonFiles);
      const existingSources = await this.stateRepository.readSources(paths);
      const metadataOptions = this.normalizeMetadataOptions(options);
      const documentsTotal = filePlans.reduce(
        (total, plan) => total + plan.recordsTotal,
        0
      );
      const importStartedAt = new Date().toISOString();
      const importId = importStartedAt.replace(/[:.]/g, "-");
      const maxDocumentSegmentSizeBytes = this.resolveDocumentSegmentSize(options);
      const summary = {
        importId,
        folderPath: checkedPaths.sourceFolderPath,
        outputPath: null,
        outputPaths: [],
        importedAt: importStartedAt,
        filesProcessed: 0,
        filesTotal: jsonFiles.length,
        documentsImported: 0,
        documentsTotal,
        sources: [],
        status: "running",
      };
      const sourceMetaMap = new Map();
      const usedSourceTables = new Set(existingSources.map((source) => source.sourceTable));

      progress.emit("started", {
        importId,
        folderPath: checkedPaths.sourceFolderPath,
        filesTotal: jsonFiles.length,
        recordsTotal: documentsTotal,
        documentsImported: 0,
      });
      await this.stateRepository.writeImportState(paths, summary);

      const segmentWriter = this.createDocumentSegmentWriter({
        paths,
        importId,
        maxDocumentSegmentSizeBytes,
      });

      try {
        for (const filePlan of filePlans) {
          const sourceTable = this.resolveSourceTableName(filePlan.fileName, usedSourceTables);
          const sourceCount = await this.importFileIntoTempStorage({
            filePath: filePlan.filePath,
            fileName: filePlan.fileName,
            sourceTable,
            importedAt: importStartedAt,
            summary,
            progress,
            importId,
            recordsTotal: documentsTotal,
            recordsInFile: filePlan.recordsTotal,
            segmentWriter,
          });

          summary.filesProcessed += 1;

          const sourceMeta = this.buildSourceMeta({
            fileName: filePlan.fileName,
            sourceTable,
            documentsImported: sourceCount,
            importedAt: importStartedAt,
            metadataOptions,
            filesTotal: filePlans.length,
          });

          summary.sources.push(sourceMeta);
          sourceMetaMap.set(sourceTable, sourceMeta);
          await this.stateRepository.writeImportState(paths, summary);
          progress.emit("file-completed", {
            importId,
            fileName: filePlan.fileName,
            filesProcessed: summary.filesProcessed,
            filesTotal: jsonFiles.length,
            documentsImported: summary.documentsImported,
            recordsTotal: documentsTotal,
            recordsInFile: filePlan.recordsTotal,
          });
        }

        await segmentWriter.finalize();
        summary.outputPaths = segmentWriter.outputPaths;
        summary.outputPath = segmentWriter.outputPaths[0] || null;
        summary.status = "completed";
        await this.stateRepository.mergeSources(paths, sourceMetaMap);
        await this.stateRepository.writeImportState(paths, summary);
        await this.stateRepository.updateDatabaseMeta(paths, (meta) => ({
          ...meta,
          updatedAt: importStartedAt,
          storage: {
            ...(meta.storage || {}),
            status: "imported",
          },
        }));
        progress.emit("completed", {
          importId,
          filesProcessed: summary.filesProcessed,
          filesTotal: jsonFiles.length,
          documentsImported: summary.documentsImported,
          outputPath: summary.outputPath,
          outputPaths: summary.outputPaths,
        });

        return summary;
      } catch (error) {
        summary.status = "failed";
        summary.error = error.message;
        await this.stateRepository.writeImportState(paths, summary);
        await segmentWriter.cleanup();
        progress.emit("failed", {
          importId,
          error: error.message,
          filesProcessed: summary.filesProcessed,
          filesTotal: jsonFiles.length,
        });
        throw error;
      }
    });
  }

  resolveSourceTableName(fileName, usedSourceTables) {
    const rawName = path.parse(fileName).name.trim();
    const normalizedName = rawName.replace(/[^\w.-]+/g, "_").slice(0, 120);

    if (!normalizedName) {
      throw new Error(localDbMessages.invalidSourceTable(fileName));
    }

    const uniqueName = usedSourceTables.has(normalizedName)
      ? `${normalizedName}_${usedSourceTables.size + 1}`
      : normalizedName;

    usedSourceTables.add(uniqueName);
    return uniqueName;
  }

  normalizeMetadataOptions(options = {}) {
    const normalizedSources = new Map();

    for (const sourceMeta of Array.isArray(options.sources) ? options.sources : []) {
      const fileName = typeof sourceMeta?.fileName === "string" ? sourceMeta.fileName.trim() : "";
      if (!fileName) continue;

      normalizedSources.set(fileName.toLowerCase(), {
        name: this.normalizeOptionalText(sourceMeta.name),
        description: this.normalizeOptionalText(sourceMeta.description),
        type: this.normalizeOptionalText(sourceMeta.type),
      });
    }

    return {
      defaultName: this.normalizeOptionalText(options.defaultName),
      defaultDescription: this.normalizeOptionalText(options.defaultDescription),
      defaultType: this.normalizeOptionalText(options.defaultType),
      sources: normalizedSources,
    };
  }

  buildSourceMeta({
    fileName,
    sourceTable,
    documentsImported,
    importedAt,
    metadataOptions,
    filesTotal = 1,
  }) {
    const perFileMeta = metadataOptions.sources.get(fileName.toLowerCase()) || {};

    return {
      sourceTable,
      fileName,
      name:
        perFileMeta.name ||
        this.resolveDefaultSourceName(sourceTable, metadataOptions.defaultName, filesTotal),
      description:
        perFileMeta.description ||
        metadataOptions.defaultDescription ||
        localDbMessages.defaultImportDescription(fileName),
      type: perFileMeta.type || metadataOptions.defaultType || "local-import",
      documentsImported,
      importedAt,
    };
  }

  resolveDefaultSourceName(sourceTable, defaultName, filesTotal) {
    if (!defaultName) return sourceTable;
    if (filesTotal <= 1) return defaultName;
    return `${defaultName} (${sourceTable})`;
  }

  normalizeOptionalText(value) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  resolveDocumentSegmentSize(options = {}) {
    const requestedSize = Number(options.maxDocumentSegmentSizeBytes);
    if (Number.isFinite(requestedSize) && requestedSize > 0) {
      return requestedSize;
    }

    return DEFAULT_DOCUMENT_SEGMENT_SIZE_BYTES;
  }

  async buildFilePlans(sourceFolderPath, jsonFiles) {
    const filePlans = [];

    for (const fileName of jsonFiles) {
      const filePath = path.join(sourceFolderPath, fileName);
      const recordsTotal = await this.importFileReader.countRecords(filePath);
      filePlans.push({
        fileName,
        filePath,
        recordsTotal,
      });
    }

    return filePlans;
  }

  async importFileIntoTempStorage({
    filePath,
    fileName,
    sourceTable,
    importedAt,
    summary,
    progress,
    importId,
    recordsTotal,
    recordsInFile,
    segmentWriter,
  }) {
    const lines = [];
    let sourceCount = 0;
    let sequenceNumber = 0;
    let emittedSinceLastProgress = 0;

    for await (const record of this.importFileReader.iterateRecords(filePath)) {
      sequenceNumber += 1;
      const document = this.documentFactory.createDocument(
        record,
        sourceTable,
        sequenceNumber,
        importedAt
      );

      lines.push(JSON.stringify(document));
      sourceCount += 1;
      summary.documentsImported += 1;
      emittedSinceLastProgress += 1;

      if (lines.length >= IMPORT_WRITE_BATCH_SIZE) {
        await segmentWriter.appendLines(lines);
        lines.length = 0;
      }

      if (emittedSinceLastProgress >= IMPORT_PROGRESS_INTERVAL) {
        progress.emit("progress", {
          importId,
          fileName,
          filesProcessed: summary.filesProcessed,
          filesTotal: summary.filesTotal,
          documentsImported: summary.documentsImported,
          recordsTotal,
          fileDocumentsImported: sourceCount,
          fileRecordsTotal: recordsInFile,
        });
        emittedSinceLastProgress = 0;
      }
    }

    if (lines.length > 0) {
      await segmentWriter.appendLines(lines);
    }

    progress.emit("progress", {
      importId,
      fileName,
      filesProcessed: summary.filesProcessed,
      filesTotal: summary.filesTotal,
      documentsImported: summary.documentsImported,
      recordsTotal,
      fileDocumentsImported: sourceCount,
      fileRecordsTotal: recordsInFile,
    });

    return sourceCount;
  }

  createDocumentSegmentWriter({ paths, importId, maxDocumentSegmentSizeBytes }) {
    const repository = this.jsonLinesRepository;
    const writerState = {
      activeTempPath: null,
      activeOutputPath: null,
      activeBytes: 0,
      segmentIndex: 0,
      tempPaths: [],
      outputPaths: [],
    };

    const ensureSegment = async () => {
      if (writerState.activeTempPath) {
        return;
      }

      writerState.segmentIndex += 1;
      const suffix = String(writerState.segmentIndex).padStart(4, "0");
      const fileName = `import_${importId}_part_${suffix}.jsonl`;
      writerState.activeOutputPath = paths.getDocumentPath(fileName);
      writerState.activeTempPath = paths.getTempPath(fileName);
      writerState.activeBytes = 0;
      writerState.tempPaths.push(writerState.activeTempPath);
      writerState.outputPaths.push(writerState.activeOutputPath);
    };

    const rotateSegment = async () => {
      writerState.activeTempPath = null;
      writerState.activeOutputPath = null;
      writerState.activeBytes = 0;
      await ensureSegment();
    };

    return {
      get outputPaths() {
        return [...writerState.outputPaths];
      },

      async appendLines(lines) {
        if (!lines.length) return;

        await ensureSegment();
        let chunk = [];
        let chunkBytes = 0;

        const flushChunk = async () => {
          if (!chunk.length) return;
          await repository.appendLines(writerState.activeTempPath, chunk);
          writerState.activeBytes += chunkBytes;
          chunk = [];
          chunkBytes = 0;
        };

        for (const line of lines) {
          const lineBytes = Buffer.byteLength(line, "utf8") + 1;
          const wouldExceedCurrentSegment =
            writerState.activeBytes > 0 &&
            writerState.activeBytes + chunkBytes + lineBytes > maxDocumentSegmentSizeBytes;

          if (wouldExceedCurrentSegment) {
            await flushChunk();
            await rotateSegment();
          }

          const wouldExceedChunkOnly =
            chunkBytes > 0 &&
            writerState.activeBytes + chunkBytes + lineBytes > maxDocumentSegmentSizeBytes;
          if (wouldExceedChunkOnly) {
            await flushChunk();
          }

          chunk.push(line);
          chunkBytes += lineBytes;
        }

        await flushChunk();
      },

      async finalize() {
        for (let index = 0; index < writerState.tempPaths.length; index += 1) {
          await repository.move(writerState.tempPaths[index], writerState.outputPaths[index]);
        }
      },

      async cleanup() {
        for (const tempPath of writerState.tempPaths) {
          await repository.remove(tempPath);
        }
      },
    };
  }
}
