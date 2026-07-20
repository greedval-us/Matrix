import fs from "fs/promises";
import path from "path";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

const SEARCHABLE_KEYS = [
  "vk",
  "number",
  "fio",
  "inn",
  "passport",
  "imei",
  "imsi",
  "telegram",
  "facebook",
  "snils",
  "mail",
  "grz",
  "sts",
  "pts",
  "vin",
  "date_of_birth",
];

export class ImportService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
  }

  async getLastImportStatus() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return null;

    const statePath = path.join(rootPath, "state", "import_state.json");
    try {
      const content = await fs.readFile(statePath, "utf8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  async importFolder(folderPath) {
    const databaseRootPath = this.localDatabaseService.getStoredRootPath();
    const databaseStatus = await this.localDatabaseService.getStatus(databaseRootPath);

    if (!databaseStatus.initialized) {
      throw new Error("Сначала создайте локальную базу в настройках");
    }

    if (!folderPath) {
      throw new Error("Не выбрана папка с файлами импорта");
    }

    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) {
      throw new Error("Путь импорта должен указывать на папку");
    }

    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const jsonFiles = entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === ".json")
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    if (jsonFiles.length === 0) {
      throw new Error("В выбранной папке нет JSON-файлов");
    }

    const importStartedAt = new Date().toISOString();
    const importId = importStartedAt.replace(/[:.]/g, "-");
    const outputPath = path.join(databaseRootPath, "documents", `import_${importId}.jsonl`);

    const summary = {
      importId,
      folderPath,
      outputPath,
      importedAt: importStartedAt,
      filesProcessed: 0,
      documentsImported: 0,
      sources: [],
    };

    const sourceMetaMap = new Map();

    for (const fileName of jsonFiles) {
      const sourceTable = path.parse(fileName).name;
      const filePath = path.join(folderPath, fileName);
      const records = await this.parseJsonFile(filePath);
      const lines = [];
      let sourceCount = 0;

      records.forEach((record, index) => {
        const document = this.normalizeRecord(record, sourceTable, index + 1, importStartedAt);
        lines.push(JSON.stringify(document));
        sourceCount += 1;
      });

      if (lines.length > 0) {
        await fs.appendFile(outputPath, `${lines.join("\n")}\n`, "utf8");
      }

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
    }

    await this.writeSourcesMeta(databaseRootPath, sourceMetaMap);
    await this.writeImportState(databaseRootPath, summary);
    await this.updateDatabaseMeta(databaseRootPath, importStartedAt);

    return summary;
  }

  async parseJsonFile(filePath) {
    const fileContent = await fs.readFile(filePath, "utf8");
    const trimmedContent = fileContent.trim();

    if (!trimmedContent) return [];

    try {
      const parsed = JSON.parse(trimmedContent);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      const normalizedContent = `[${trimmedContent.replace(/\}\s*\{/g, "},{")}]`;
      const parsed = JSON.parse(normalizedContent);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  }

  normalizeRecord(record, sourceTable, sequenceNumber, importedAt) {
    const raw = { ...record };
    const normalized = { ...record };

    if (!Object.prototype.hasOwnProperty.call(normalized, "fio")) {
      const fioParts = [normalized.surname, normalized.name, normalized.patronymic]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .filter(Boolean);

      if (fioParts.length > 0) {
        normalized.fio = fioParts.join(" ");
      }
    }

    delete normalized.surname;
    delete normalized.name;
    delete normalized.patronymic;

    if (typeof normalized.date_of_birth === "string") {
      normalized.date_of_birth =
        this.formatDateOfBirth(normalized.date_of_birth) || normalized.date_of_birth;
    }

    const fields = {};
    const invalidFields = {};

    for (const [key, value] of Object.entries(normalized)) {
      if (value === null || value === undefined || value === "") continue;

      if (SEARCHABLE_KEYS.includes(key)) {
        const { valid, cleanValue, invalidValue } = this.validateField(key, value);
        if (valid && cleanValue) {
          fields[key] = cleanValue;
        } else if (invalidValue) {
          invalidFields[`no_valid_${key}`] = invalidValue;
        }
      } else {
        fields[key] = typeof value === "string" ? value.trim() : value;
      }
    }

    if (fields.fio) {
      fields.fio = String(fields.fio).trim().toUpperCase();
    }

    const docRowId = raw.id ?? sequenceNumber;

    return {
      docId: `${sourceTable}:${docRowId}`,
      sourceTable,
      rowId: docRowId,
      importedAt,
      fields,
      invalidFields,
      raw,
    };
  }

  validateField(key, value) {
    const stringValue = String(value).trim();
    if (!stringValue) {
      return { valid: false, cleanValue: null, invalidValue: null };
    }

    switch (key) {
      case "number": {
        const normalized = stringValue.replace(/[^\d]/g, "");
        return normalized.length >= 9 && normalized.length <= 14
          ? { valid: true, cleanValue: normalized, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      }
      case "snils":
        return /^\d{11}$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "inn":
        return /^\d{10}(\d{2})?$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "passport":
        return /^\d{10}$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "mail":
        return /^[^ @]+@[^ @]+\.[^ @]+$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue.toLowerCase(), invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "fio":
        return this.isValidFio(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "date_of_birth": {
        const formatted = this.formatDateOfBirth(stringValue);
        return formatted
          ? { valid: true, cleanValue: formatted, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      }
      case "telegram":
      case "facebook":
      case "imei":
      case "imsi":
      case "vk":
        return /^\d+$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      default:
        return { valid: true, cleanValue: stringValue, invalidValue: null };
    }
  }

  isValidFio(value) {
    const compactValue = value.replace(/[\s\xA0]+/gu, "");
    if (!compactValue) return false;
    if (value.trim().split(/\s+/).length < 2) return false;
    return /^[a-zA-Zа-яА-ЯёЁйЙъЪьЬґҐєЄіІїЇ-]+$/u.test(compactValue);
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

  async writeSourcesMeta(databaseRootPath, sourceMetaMap) {
    const metaPath = path.join(databaseRootPath, "meta", "sources.json");
    let sources = [];

    try {
      const content = await fs.readFile(metaPath, "utf8");
      sources = JSON.parse(content);
    } catch {
      sources = [];
    }

    const bySource = new Map(sources.map((source) => [source.sourceTable, source]));
    for (const [sourceTable, sourceMeta] of sourceMetaMap.entries()) {
      bySource.set(sourceTable, sourceMeta);
    }

    await fs.writeFile(
      metaPath,
      JSON.stringify(Array.from(bySource.values()), null, 2),
      "utf8"
    );
  }

  async writeImportState(databaseRootPath, summary) {
    const importStatePath = path.join(databaseRootPath, "state", "import_state.json");
    await fs.writeFile(importStatePath, JSON.stringify(summary, null, 2), "utf8");
  }

  async updateDatabaseMeta(databaseRootPath, updatedAt) {
    const metaPath = path.join(databaseRootPath, "meta", "db.json");
    try {
      const content = await fs.readFile(metaPath, "utf8");
      const meta = JSON.parse(content);
      meta.updatedAt = updatedAt;
      meta.storage.status = "imported";
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    } catch {
      // ignore metadata update failures
    }
  }
}
