import { BuildLocalIndexesUseCase } from "../application/localdb/BuildLocalIndexesUseCase.js";
import { LocalIndexBuildPlanner } from "../application/localdb/LocalIndexBuildPlanner.js";
import { JsonLinesRepository } from "../localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { OperationCoordinator } from "../localdb/OperationCoordinator.js";
import { SearchTermService } from "../localdb/SearchTermService.js";
import log from "../utils/logger.js";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

export class IndexService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
    this.stateRepository = new LocalDatabaseStateRepository();
    this.jsonLinesRepository = new JsonLinesRepository();
    this.useCase = new BuildLocalIndexesUseCase({
      localDatabaseService: this.localDatabaseService,
      stateRepository: this.stateRepository,
      jsonLinesRepository: this.jsonLinesRepository,
      operationCoordinator: new OperationCoordinator(),
      termService: new SearchTermService(),
      indexBuildPlanner: new LocalIndexBuildPlanner({
        jsonLinesRepository: this.jsonLinesRepository,
      }),
    });
  }

  async getLastIndexStatus() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return null;

    return await this.stateRepository.readIndexState(new LocalDatabasePaths(rootPath));
  }

  async buildIndexes(options) {
    try {
      const rootPath = this.localDatabaseService.getStoredRootPath();
      log.info(`[Index] buildIndexes requested rootPath=${rootPath || "<empty>"}`);
      return await this.useCase.execute(options);
    } catch (error) {
      if (this.isAlreadyRunningError(error)) {
        log.warn("[Index] buildIndexes ignored because indexing is already running");
        return await this.getLastIndexStatus();
      }
      log.error("[Index] buildIndexes failed", error);
      throw error;
    }
  }

  async cancelBuild(reason = "manual-stop") {
    this.useCase.cancel(reason);
    return await this.getLastIndexStatus();
  }

  isAlreadyRunningError(error) {
    return String(error?.message || "").includes('Operation "local-db-index" is already running');
  }
}
