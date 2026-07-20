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
const MAX_RESULTS = 250;

export class SearchClientService {
  constructor() {
    this.currentCall = null;
    this.localDatabaseService = new LocalDatabaseService();
  }

  async search(payload) {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) {
      throw new Error("Локальная база не настроена");
    }

    const queryEntries = Object.entries(payload || {})
      .filter(([field, value]) => INDEXABLE_FIELDS.includes(field) && value)
      .map(([field, value]) => ({
        field,
        term: this.buildQueryTerm(field, value),
      }))
      .filter((entry) => entry.term);

    if (queryEntries.length === 0) {
      return [];
    }

    const docIdSets = [];
    for (const queryEntry of queryEntries) {
      const docIds = await this.findDocIdsByTerm(rootPath, queryEntry.field, queryEntry.term);
      docIdSets.push(docIds);
    }

    const matchedDocIds = this.intersectDocIdSets(docIdSets).slice(0, MAX_RESULTS);
    if (matchedDocIds.length === 0) {
      return [];
    }

    const documents = await this.loadDocumentsByIds(rootPath, matchedDocIds);
    const sourceMetaMap = await this.loadSourceMeta(rootPath);

    const results = [];
    const seenSources = new Set();

    for (const document of documents) {
      if (!seenSources.has(document.sourceTable)) {
        const sourceMeta = sourceMetaMap.get(document.sourceTable);
        results.push({
          object_data_base: {
            name_table: document.sourceTable,
            name: document.sourceTable,
            info: sourceMeta
              ? `Импорт из файла ${sourceMeta.fileName}`
              : "Локальный источник",
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
  }

  cancel() {
    this.currentCall = null;
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
        return stringValue.replace(/[^\d?%]/g, "");
      case "mail":
        return stringValue.toLowerCase();
      case "fio":
        return stringValue.toUpperCase().replace(/\s+/g, " ").trim();
      case "vin":
      case "grz":
        return stringValue.toUpperCase().replace(/\s+/g, "");
      case "date_of_birth":
        return this.formatDateOfBirth(stringValue) || stringValue;
      default:
        return stringValue;
    }
  }

  buildQueryTerm(field, value) {
    const normalizedTerm = this.normalizeTerm(field, value);
    if (!normalizedTerm) return null;

    if (field !== "fio" || this.hasWildcards(normalizedTerm)) {
      return normalizedTerm;
    }

    const parts = normalizedTerm.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    return `${parts.join("%")}%`;
  }

  formatDateOfBirth(date) {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date.replace(/\//g, ".");
    if (/^\d{2}-\d{2}-\d{4}$/.test(date)) return date.replace(/-/g, ".");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-");
      return `${day}.${month}.${year}`;
    }
    return null;
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

  hasWildcards(term) {
    return term.includes("?") || term.includes("%");
  }

  getWildcardPrefix(term) {
    const match = term.match(/^[^?%]+/);
    return match ? match[0] : "";
  }

  buildWildcardRegex(term) {
    const escaped = term.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/%/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${pattern}$`, "u");
  }

  async findDocIdsByTerm(rootPath, field, term) {
    if (this.hasWildcards(term)) {
      return await this.findDocIdsByWildcard(rootPath, field, term);
    }

    const bucketPath = path.join(
      rootPath,
      "indexes",
      field,
      `${this.getBucketName(term)}.jsonl`
    );

    try {
      await fsPromises.access(bucketPath);
    } catch {
      return [];
    }

    const matches = [];
    const stream = fs.createReadStream(bucketPath, { encoding: "utf8" });
    const reader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of reader) {
        if (!line.trim()) continue;
        const entry = JSON.parse(line);
        if (entry.term === term) {
          matches.push(entry.docId);
          if (matches.length >= MAX_RESULTS) break;
        }
      }
    } finally {
      reader.close();
      stream.close();
    }

    return matches;
  }

  async findDocIdsByWildcard(rootPath, field, term) {
    const fieldDir = path.join(rootPath, "indexes", field);
    const bucketFiles = await this.resolveWildcardBuckets(fieldDir, term);
    if (bucketFiles.length === 0) return [];

    const regex = this.buildWildcardRegex(term);
    const matches = new Set();

    for (const bucketPath of bucketFiles) {
      const stream = fs.createReadStream(bucketPath, { encoding: "utf8" });
      const reader = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      try {
        for await (const line of reader) {
          if (!line.trim()) continue;
          const entry = JSON.parse(line);
          if (regex.test(entry.term)) {
            matches.add(entry.docId);
            if (matches.size >= MAX_RESULTS) break;
          }
        }
      } finally {
        reader.close();
        stream.close();
      }

      if (matches.size >= MAX_RESULTS) break;
    }

    return [...matches];
  }

  async resolveWildcardBuckets(fieldDir, term) {
    try {
      const prefix = this.getWildcardPrefix(term);
      if (prefix) {
        return [path.join(fieldDir, `${this.getBucketName(prefix)}.jsonl`)];
      }

      const entries = await fsPromises.readdir(fieldDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".jsonl")
        .map((entry) => path.join(fieldDir, entry.name))
        .sort((a, b) => a.localeCompare(b));
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

  async loadDocumentsByIds(rootPath, docIds) {
    const lookupDir = path.join(rootPath, "indexes", DOCUMENT_LOOKUP_DIRNAME);
    const targetDocIds = new Set(docIds);
    const documents = [];
    const bucketMap = new Map();

    for (const docId of docIds) {
      const bucket = this.getDocumentBucketName(docId);
      const list = bucketMap.get(bucket) || [];
      list.push(docId);
      bucketMap.set(bucket, list);
    }

    for (const [bucket, bucketDocIds] of bucketMap.entries()) {
      const bucketPath = path.join(lookupDir, `${bucket}.jsonl`);

      try {
        await fsPromises.access(bucketPath);
      } catch {
        continue;
      }

      const bucketSet = new Set(bucketDocIds);
      const stream = fs.createReadStream(bucketPath, { encoding: "utf8" });
      const reader = readline.createInterface({
        input: stream,
        crlfDelay: Infinity,
      });

      try {
        for await (const line of reader) {
          if (!line.trim()) continue;
          const entry = JSON.parse(line);
          if (bucketSet.has(entry.docId) && targetDocIds.has(entry.docId)) {
            documents.push(entry);
            targetDocIds.delete(entry.docId);
            if (targetDocIds.size === 0) break;
          }
        }
      } finally {
        reader.close();
        stream.close();
      }

      if (targetDocIds.size === 0) break;
    }

    return documents;
  }

  async loadSourceMeta(rootPath) {
    const sourcesPath = path.join(rootPath, "meta", "sources.json");
    try {
      const content = await fsPromises.readFile(sourcesPath, "utf8");
      const sources = JSON.parse(content);
      return new Map(sources.map((source) => [source.sourceTable, source]));
    } catch {
      return new Map();
    }
  }
}
