import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";

export class EnsureLocalDatabaseReadyUseCase {
  constructor({ localDatabaseService, migrationService }) {
    this.localDatabaseService = localDatabaseService;
    this.migrationService = migrationService;
  }

  async execute(rootPath = this.localDatabaseService.getStoredRootPath()) {
    if (!rootPath) {
      return null;
    }

    const status = await this.localDatabaseService.getStatus(rootPath);
    if (!status.initialized) {
      return status;
    }

    await this.migrationService.migrate(new LocalDatabasePaths(status.rootPath));
    return await this.localDatabaseService.getStatus(status.rootPath);
  }
}
