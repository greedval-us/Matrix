import { LocalDatabasePaths } from "../localdb/LocalDatabasePaths.js";
import { normalizeSearchBackendConfig } from "../sqlite/SearchBackendConfig.js";
import { SEARCH_BACKEND_SQLITE } from "../localdb/constants.js";
import { SQLITE_INDEX_FORMAT_VERSION } from "../localdb/constants.js";

export class SearchBackendConfigService {
  constructor({ localDatabaseService, stateRepository } = {}) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
  }

  async getConfig() {
    const paths = await this.getReadyPaths();
    const stored = await this.stateRepository.readSearchBackendConfig(paths);
    return normalizeSearchBackendConfig(stored);
  }

  async setConfig(value) {
    const paths = await this.getReadyPaths();
    const config = normalizeSearchBackendConfig(value);
    if (config.backend === SEARCH_BACKEND_SQLITE) {
      const state = await this.stateRepository.readSqliteIndexState(paths);
      if (!state ||
        state.formatVersion !== SQLITE_INDEX_FORMAT_VERSION ||
        !["running", "cancelled", "completed"].includes(state.status)) {
        throw new Error("Build SQLite indexes before enabling SQLite search.");
      }
    }
    await this.stateRepository.writeSearchBackendConfig(paths, config);
    return config;
  }

  async getReadyPaths() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    const status = await this.localDatabaseService.ensureReady(rootPath);
    if (!status.initialized) {
      throw new Error("Local database is not initialized.");
    }
    return new LocalDatabasePaths(rootPath);
  }
}
