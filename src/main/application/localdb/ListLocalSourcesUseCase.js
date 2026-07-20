import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";
import { localDbMessages } from "../../localdb/messages.js";

export class ListLocalSourcesUseCase {
  constructor({ localDatabaseService, stateRepository }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
  }

  async execute() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return [];

    await this.localDatabaseService.ensureReady(rootPath);

    const sources = await this.stateRepository.readSources(new LocalDatabasePaths(rootPath));

    return sources.map((source) => ({
      name_table: source.sourceTable,
      name: source.sourceTable,
      info: localDbMessages.searchBaseInfo(source.fileName),
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
  }
}
