import path from "path";
import {
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
      const documentsTotal = filePlans.reduce(
        (total, plan) => total + plan.recordsTotal,
        0
      );
      const importStartedAt = new Date().toISOString();
      const importId = importStartedAt.replace(/[:.]/g, "-");
      const outputPath = paths.getImportOutputPath(importId);
      const tempOutputPath = paths.getTempPath(`import-${importId}.jsonl`);
      const summary = {
        importId,
        folderPath: checkedPaths.sourceFolderPath,
        outputPath,
        importedAt: importStartedAt,
        filesProcessed: 0,
        filesTotal: jsonFiles.length,
        documentsImported: 0,
        documentsTotal,
        sources: [],
        status: "running",
      };
      const sourceMetaMap = new Map();
      const usedSourceTables = new Set();

      progress.emit("started", {
        importId,
        folderPath: checkedPaths.sourceFolderPath,
        filesTotal: jsonFiles.length,
        recordsTotal: documentsTotal,
        documentsImported: 0,
      });
      await this.stateRepository.writeImportState(paths, summary);

      try {
        for (const filePlan of filePlans) {
          const sourceTable = this.resolveSourceTableName(filePlan.fileName, usedSourceTables);
          const sourceCount = await this.importFileIntoTempStorage({
            filePath: filePlan.filePath,
            fileName: filePlan.fileName,
            sourceTable,
            importedAt: importStartedAt,
            tempOutputPath,
            summary,
            progress,
            importId,
            recordsTotal: documentsTotal,
            recordsInFile: filePlan.recordsTotal,
          });

          summary.filesProcessed += 1;

          const sourceMeta = {
            sourceTable,
            fileName: filePlan.fileName,
            documentsImported: sourceCount,
            importedAt: importStartedAt,
          };

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

        await this.jsonLinesRepository.move(tempOutputPath, outputPath);
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
          outputPath,
        });

        return summary;
      } catch (error) {
        summary.status = "failed";
        summary.error = error.message;
        await this.stateRepository.writeImportState(paths, summary);
        await this.jsonLinesRepository.remove(tempOutputPath);
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
    tempOutputPath,
    summary,
    progress,
    importId,
    recordsTotal,
    recordsInFile,
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
        await this.jsonLinesRepository.appendLines(tempOutputPath, lines);
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
      await this.jsonLinesRepository.appendLines(tempOutputPath, lines);
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
}
