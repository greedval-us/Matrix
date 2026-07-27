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

    return sources.map((source) => this.mapSourceToListRow(source));
  }

  mapSourceToListRow(source) {
    return {
      name_table: source.sourceTable,
      name: source.name || source.sourceTable,
      info:
        source.description ||
        (source.fileName ? localDbMessages.searchBaseInfo(source.fileName) : localDbMessages.localSourceInfo),
      country: source.country || "",
      access_level: String(source.accessLevel ?? "local"),
      count: String(source.documentsImported ?? source.recordCount ?? 0),
      search_mail: this.mapSearchFlag(source.searchFields?.mail),
      search_fio: this.mapSearchFlag(source.searchFields?.fio),
      search_number: this.mapSearchFlag(source.searchFields?.number),
      search_telegram: this.mapSearchFlag(source.searchFields?.telegram),
      search_passport: this.mapSearchFlag(source.searchFields?.passport),
      search_snils: this.mapSearchFlag(source.searchFields?.snils),
      search_inn: this.mapSearchFlag(source.searchFields?.inn),
      search_imei: this.mapSearchFlag(source.searchFields?.imei),
      search_imsi: this.mapSearchFlag(source.searchFields?.imsi),
      search_facebook: this.mapSearchFlag(source.searchFields?.facebook),
      search_vk: this.mapSearchFlag(source.searchFields?.vk),
      search_grz: this.mapSearchFlag(source.searchFields?.grz),
      search_vin: this.mapSearchFlag(source.searchFields?.vin),
      type: source.type || "local-import",
      trust: String(source.trust ?? true),
      updated_at: source.updatedAt || source.importedAt || "",
      created_at: source.createdAt || source.importedAt || "",
      relevance_date: String(source.relevanceDate ?? source.importedAt ?? ""),
    };
  }

  mapSearchFlag(value) {
    return String(value ?? true);
  }
}
