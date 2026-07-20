import path from "path";
import {
  BUFFER_FLUSH_SIZE,
  INDEXABLE_FIELDS,
  INDEX_BACKUP_TEMP_PREFIX,
  INDEX_BUILD_TEMP_PREFIX,
  PROGRESS_SAVE_INTERVAL,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";

export class BuildLocalIndexesUseCase {
  constructor({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    operationCoordinator,
    termService,
  }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.jsonLinesRepository = jsonLinesRepository;
    this.operationCoordinator = operationCoordinator;
    this.termService = termService;
  }

  async execute() {
    return await this.operationCoordinator.runExclusive("local-db-index", async () => {
      const databaseRootPath = this.localDatabaseService.getStoredRootPath();
      const databaseStatus = await this.localDatabaseService.getStatus(databaseRootPath);

      if (!databaseStatus.initialized) {
        throw new Error(localDbMessages.databaseNotInitialized);
      }

      const paths = new LocalDatabasePaths(databaseRootPath);
      const documentFiles = await this.jsonLinesRepository.listFiles(paths.documentsDir, ".jsonl");

      if (documentFiles.length === 0) {
        throw new Error(localDbMessages.noIndexedDocuments);
      }

      const startedAt = new Date().toISOString();
      const buildId = startedAt.replace(/[:.]/g, "-");
      const tempIndexesDir = paths.getTempPath(`${INDEX_BUILD_TEMP_PREFIX}-${buildId}`);
      const backupIndexesDir = paths.getTempPath(`${INDEX_BACKUP_TEMP_PREFIX}-${buildId}`);
      const summary = {
        status: "running",
        indexedAt: startedAt,
        documentFiles,
        filesTotal: documentFiles.length,
        filesProcessed: 0,
        indexedDocuments: 0,
        indexedEntries: 0,
        lookupEntries: 0,
        currentFile: null,
        completedAt: null,
        fields: Object.fromEntries(INDEXABLE_FIELDS.map((field) => [field, 0])),
      };

      await this.jsonLinesRepository.remove(tempIndexesDir);
      await this.prepareIndexDirectories(paths, tempIndexesDir);
      await this.stateRepository.writeIndexState(paths, summary);

      try {
        for (const fileName of documentFiles) {
          summary.currentFile = fileName;
          await this.stateRepository.writeIndexState(paths, summary);
          await this.indexDocumentFile(
            path.join(paths.documentsDir, fileName),
            paths,
            tempIndexesDir,
            summary
          );
          summary.filesProcessed += 1;
          await this.stateRepository.writeIndexState(paths, summary);
        }

        await this.replaceIndexesAtomically(paths, tempIndexesDir, backupIndexesDir);

        summary.status = "completed";
        summary.currentFile = null;
        summary.completedAt = new Date().toISOString();

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

        return summary;
      } catch (error) {
        summary.status = "failed";
        summary.error = error.message;
        summary.completedAt = new Date().toISOString();
        await this.stateRepository.writeIndexState(paths, summary);
        await this.jsonLinesRepository.remove(tempIndexesDir);
        throw error;
      }
    });
  }

  async prepareIndexDirectories(paths, indexesDir = paths.indexesDir) {
    for (const field of INDEXABLE_FIELDS) {
      await this.jsonLinesRepository.ensureDirectory(paths.getIndexFieldDir(field, indexesDir));
    }

    await this.jsonLinesRepository.ensureDirectory(paths.getDocumentLookupDir(indexesDir));
  }

  async indexDocumentFile(filePath, paths, indexesDir, summary) {
    const bufferMap = new Map();
    let documentsSinceLastSave = 0;

    try {
      for await (const document of this.jsonLinesRepository.iterateJson(filePath)) {
        summary.indexedDocuments += 1;
        documentsSinceLastSave += 1;

        await this.bufferDocumentLookup(paths, indexesDir, document, bufferMap, summary);
        await this.bufferFieldIndexes(paths, indexesDir, document, bufferMap, summary);

        if (documentsSinceLastSave >= PROGRESS_SAVE_INTERVAL) {
          await this.flushAllBuffers(bufferMap);
          await this.stateRepository.writeIndexState(paths, summary);
          documentsSinceLastSave = 0;
        }
      }
    } finally {
      await this.flushAllBuffers(bufferMap);
    }
  }

  async bufferFieldIndexes(paths, indexesDir, document, bufferMap, summary) {
    for (const field of INDEXABLE_FIELDS) {
      const rawValue = document.fields?.[field];
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;

      const term = this.termService.normalizeIndexTerm(field, rawValue);
      if (!term) continue;

      const bucket = this.termService.getBucketName(term);
      const bucketFile = paths.getIndexBucketPath(field, bucket, indexesDir);
      const entry = JSON.stringify({
        term,
        docId: document.docId,
        sourceTable: document.sourceTable,
        rowId: document.rowId,
      });

      await this.pushBufferedLine(bufferMap, bucketFile, entry);
      summary.indexedEntries += 1;
      summary.fields[field] += 1;
    }
  }

  async bufferDocumentLookup(paths, indexesDir, document, bufferMap, summary) {
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
    summary.lookupEntries += 1;
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
