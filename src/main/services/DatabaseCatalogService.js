import fs from "fs/promises";
import path from "path";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

export class DatabaseCatalogService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
  }

  async list(_payload) {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return [];

    const sourcesPath = path.join(rootPath, "meta", "sources.json");

    try {
      const content = await fs.readFile(sourcesPath, "utf8");
      const sources = JSON.parse(content);

      return sources.map((source) => ({
        name_table: source.sourceTable,
        name: source.sourceTable,
        info: `Импорт из файла ${source.fileName}`,
        country: "",
        access_level: "local",
        count: String(source.documentsImported ?? 0),
        search_mail: "true",
        search_fio: "true",
        search_number: "true",
        search_telegram: "true",
        search_passport: "true",
        search_snils: "true",
        search_inn: "true",
        search_imei: "true",
        search_imsi: "true",
        search_facebook: "true",
        search_vk: "true",
        search_grz: "true",
        search_vin: "true",
        type: "local-import",
        trust: "true",
        updated_at: source.importedAt || "",
        created_at: source.importedAt || "",
        relevance_date: source.importedAt || "",
      }));
    } catch {
      return [];
    }
  }
}
