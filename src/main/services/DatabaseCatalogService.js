import { ListLocalSourcesUseCase } from "../application/localdb/ListLocalSourcesUseCase.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

export class DatabaseCatalogService {
  constructor() {
    this.useCase = new ListLocalSourcesUseCase({
      localDatabaseService: new LocalDatabaseService(),
      stateRepository: new LocalDatabaseStateRepository(),
    });
  }

  async list(_payload) {
    return await this.useCase.execute();
  }
}
