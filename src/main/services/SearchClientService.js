import { SearchLocalDatabaseUseCase } from "../application/localdb/SearchLocalDatabaseUseCase.js";
import { SearchSqliteIndexesUseCase } from "../application/sqlite/SearchSqliteIndexesUseCase.js";
import { JsonLinesRepository } from "../localdb/JsonLinesRepository.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../localdb/SearchTermService.js";
import { SEARCH_BACKEND_SQLITE } from "../localdb/constants.js";
import { LocalDatabasePaths } from "../localdb/LocalDatabasePaths.js";
import { LocalDatabaseService } from "./LocalDatabaseService.js";
import { SearchBackendConfigService } from "./SearchBackendConfigService.js";
import { SqliteIndexStore } from "../sqlite/SqliteIndexStore.js";

export class SearchClientService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
    this.stateRepository = new LocalDatabaseStateRepository();
    this.jsonLinesRepository = new JsonLinesRepository();
    this.termService = new SearchTermService();
    this.configService = new SearchBackendConfigService({
      localDatabaseService: this.localDatabaseService,
      stateRepository: this.stateRepository,
    });
    this.embeddedUseCase = new SearchLocalDatabaseUseCase({
      localDatabaseService: this.localDatabaseService,
      stateRepository: this.stateRepository,
      jsonLinesRepository: this.jsonLinesRepository,
      termService: this.termService,
    });
    this.activeUseCase = this.embeddedUseCase;
    this.sqliteIndexStore = null;
    this.sqliteRootPath = null;
  }

  async search(payload, options = {}) {
    const config = await this.configService.getConfig();
    if (config.backend === SEARCH_BACKEND_SQLITE) {
      const rootPath = this.localDatabaseService.getStoredRootPath();
      if (!this.sqliteIndexStore || this.sqliteRootPath !== rootPath) {
        this.sqliteIndexStore?.close();
        this.sqliteIndexStore = new SqliteIndexStore({
          paths: new LocalDatabasePaths(rootPath),
        });
        this.sqliteRootPath = rootPath;
      }
      this.activeUseCase = new SearchSqliteIndexesUseCase({
        localDatabaseService: this.localDatabaseService,
        stateRepository: this.stateRepository,
        jsonLinesRepository: this.jsonLinesRepository,
        termService: this.termService,
        indexStore: this.sqliteIndexStore,
        maxResults: config.sqlite.maxResults,
      });
      return await this.activeUseCase.execute(payload, options);
    }
    this.activeUseCase = this.embeddedUseCase;
    return await this.embeddedUseCase.execute(payload, options);
  }

  cancel() {
    this.activeUseCase?.cancel();
  }

  async dispose() {
    this.cancel();
    this.sqliteIndexStore?.close();
    this.sqliteIndexStore = null;
    this.sqliteRootPath = null;
  }
}
