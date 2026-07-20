import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import readline from "readline";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

const INDEXABLE_FIELDS = [
  "number",
  "mail",
  "fio",
  "passport",
  "inn",
  "snils",
  "telegram",
  "vk",
  "facebook",
  "grz",
  "vin",
  "date_of_birth",
];

const DOCUMENT_LOOKUP_DIRNAME = "_documents";
const BUFFER_FLUSH_SIZE = 1000;
const PROGRESS_SAVE_INTERVAL = 5000;

export class IndexService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
  }

  async getLastIndexStatus() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return null;

    const statePath = path.join(rootPath, "state", "index_state.json");
    try {
      const content = await fsPromises.readFile(statePath, "utf8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async buildIndexes() {
    const databaseRootPath = this.localDatabaseService.getStoredRootPath();
    const databaseStatus = await this.localDatabaseService.getStatus(databaseRootPath);

    if (!databaseStatus.initialized) {
      throw new Error("Сначала создайте локальную базу в настройках");
    }

    const documentsDir = path.join(databaseRootPath, "documents");
    const indexesDir = path.join(databaseRootPath, "indexes");

    const entries = await fsPromises.readdir(documentsDir, { withFileTypes: true });
    const documentFiles = entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".jsonl")
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    if (documentFiles.length === 0) {
      throw new Error("Нет импортированных документов для индексации");
    }

    await this.resetIndexes(indexesDir);

    const startedAt = new Date().toISOString();
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

    await this.prepareIndexDirectories(indexesDir);
    await this.writeIndexManifest(databaseRootPath, summary);

    try {
      for (const fileName of documentFiles) {
        const filePath = path.join(documentsDir, fileName);
        summary.currentFile = fileName;

        await this.writeIndexManifest(databaseRootPath, summary);
        await this.indexDocumentFile(filePath, indexesDir, databaseRootPath, summary);

        summary.filesProcessed += 1;
        await this.writeIndexManifest(databaseRootPath, summary);
      }

      summary.status = "completed";
      summary.currentFile = null;
      summary.completedAt = new Date().toISOString();

      await this.writeIndexManifest(databaseRootPath, summary);
      await this.updateDatabaseMeta(databaseRootPath, summary.completedAt);

      return summary;
    } catch (error) {
      summary.status = "failed";
      summary.error = error.message;
      summary.completedAt = new Date().toISOString();

      await this.writeIndexManifest(databaseRootPath, summary);
      throw error;
    }
  }

  async resetIndexes(indexesDir) {
    await fsPromises.rm(indexesDir, { recursive: true, force: true });
    await fsPromises.mkdir(indexesDir, { recursive: true });
  }

  async prepareIndexDirectories(indexesDir) {
    for (const field of INDEXABLE_FIELDS) {
      await fsPromises.mkdir(path.join(indexesDir, field), { recursive: true });
    }

    await fsPromises.mkdir(path.join(indexesDir, DOCUMENT_LOOKUP_DIRNAME), {
      recursive: true,
    });
  }

  async indexDocumentFile(filePath, indexesDir, databaseRootPath, summary) {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const reader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    const bufferMap = new Map();
    let documentsSinceLastSave = 0;

    try {
      for await (const line of reader) {
        if (!line.trim()) continue;

        const document = JSON.parse(line);
        summary.indexedDocuments += 1;
        documentsSinceLastSave += 1;

        await this.bufferDocumentLookup(indexesDir, document, bufferMap, summary);
        await this.bufferFieldIndexes(indexesDir, document, bufferMap, summary);

        if (documentsSinceLastSave >= PROGRESS_SAVE_INTERVAL) {
          await this.flushAllBuffers(bufferMap);
          await this.writeIndexManifest(databaseRootPath, summary);
          documentsSinceLastSave = 0;
        }
      }
    } finally {
      await this.flushAllBuffers(bufferMap);
      reader.close();
      stream.close();
    }
  }

  async bufferFieldIndexes(indexesDir, document, bufferMap, summary) {
    for (const field of INDEXABLE_FIELDS) {
      const rawValue = document.fields?.[field];
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;

      const term = this.normalizeTerm(field, rawValue);
      if (!term) continue;

      const bucket = this.getBucketName(term);
      const bucketFile = path.join(indexesDir, field, `${bucket}.jsonl`);
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

  async bufferDocumentLookup(indexesDir, document, bufferMap, summary) {
    const lookupBucket = this.getDocumentBucketName(document.docId);
    const lookupFile = path.join(
      indexesDir,
      DOCUMENT_LOOKUP_DIRNAME,
      `${lookupBucket}.jsonl`
    );

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

    await fsPromises.appendFile(filePath, `${lines.join("\n")}\n`, "utf8");
    bufferMap.set(filePath, []);
  }

  async flushAllBuffers(bufferMap) {
    for (const filePath of bufferMap.keys()) {
      await this.flushBuffer(bufferMap, filePath);
    }
  }

  normalizeTerm(field, value) {
    const stringValue = String(value).trim();
    if (!stringValue) return null;

    switch (field) {
      case "number":
      case "passport":
      case "inn":
      case "snils":
      case "telegram":
      case "vk":
      case "facebook":
      case "imei":
      case "imsi":
        return stringValue.replace(/[^\d]/g, "");
      case "mail":
        return stringValue.toLowerCase();
      case "fio":
        return stringValue.toUpperCase().replace(/\s+/g, " ").trim();
      case "vin":
      case "grz":
        return stringValue.toUpperCase().replace(/\s+/g, "");
      case "date_of_birth":
        return stringValue;
      default:
        return stringValue;
    }
  }

  getBucketName(term) {
    const normalized = term.toLowerCase().replace(/[^a-zа-яё0-9]/giu, "");
    if (!normalized) return "__";
    return normalized.slice(0, 2).padEnd(2, "_");
  }

  getDocumentBucketName(docId) {
    const normalized = String(docId)
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/giu, "");

    if (!normalized) return "__";
    return normalized.slice(0, 2).padEnd(2, "_");
  }

  async writeIndexManifest(databaseRootPath, summary) {
    const statePath = path.join(databaseRootPath, "state", "index_state.json");
    await fsPromises.writeFile(statePath, JSON.stringify(summary, null, 2), "utf8");
  }

  async updateDatabaseMeta(databaseRootPath, updatedAt) {
    const metaPath = path.join(databaseRootPath, "meta", "db.json");
    try {
      const content = await fsPromises.readFile(metaPath, "utf8");
      const meta = JSON.parse(content);
      meta.updatedAt = updatedAt;
      meta.indexes = {
        ...(meta.indexes || {}),
        version: 1,
        builtAt: updatedAt,
        fields: INDEXABLE_FIELDS,
      };
      await fsPromises.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    } catch {
      // ignore metadata update failures
    }
  }
}
