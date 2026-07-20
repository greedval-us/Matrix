import path from "path";
import {
  IMPORT_WRITE_BATCH_SIZE,
  MAX_IMPORT_FILES,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";

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

  async execute(folderPath) {
    return await this.operationCoordinator.runExclusive("local-db-import", async () => {
      const databaseRootPath = this.localDatabaseService.getStoredRootPath();
      const databaseStatus = await this.localDatabaseService.getStatus(databaseRootPath);

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
        documentsImported: 0,
        sources: [],
        status: "running",
      };
      const sourceMetaMap = new Map();
      const usedSourceTables = new Set();

      await this.stateRepository.writeImportState(paths, summary);

      try {
        for (const fileName of jsonFiles) {
          const sourceTable = this.resolveSourceTableName(fileName, usedSourceTables);
          const filePath = path.join(checkedPaths.sourceFolderPath, fileName);
          const sourceCount = await this.importFileIntoTempStorage({
            filePath,
            sourceTable,
            importedAt: importStartedAt,
            tempOutputPath,
          });

          summary.filesProcessed += 1;
          summary.documentsImported += sourceCount;

          const sourceMeta = {
            sourceTable,
            fileName,
            documentsImported: sourceCount,
            importedAt: importStartedAt,
          };

          summary.sources.push(sourceMeta);
          sourceMetaMap.set(sourceTable, sourceMeta);
          await this.stateRepository.writeImportState(paths, summary);
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

        return summary;
      } catch (error) {
        summary.status = "failed";
        summary.error = error.message;
        await this.stateRepository.writeImportState(paths, summary);
        await this.jsonLinesRepository.remove(tempOutputPath);
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

  async importFileIntoTempStorage({ filePath, sourceTable, importedAt, tempOutputPath }) {
    const lines = [];
    let sourceCount = 0;
    let sequenceNumber = 0;

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

      if (lines.length >= IMPORT_WRITE_BATCH_SIZE) {
        await this.jsonLinesRepository.appendLines(tempOutputPath, lines);
        lines.length = 0;
      }
    }

    if (lines.length > 0) {
      await this.jsonLinesRepository.appendLines(tempOutputPath, lines);
    }

    return sourceCount;
  }
}
