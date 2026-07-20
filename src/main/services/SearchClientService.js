import { SearchLocalDatabaseUseCase } from "../application/localdb/SearchLocalDatabaseUseCase.js";
import { JsonLinesRepository } from "../localdb/JsonLinesRepository.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../localdb/SearchTermService.js";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

export class SearchClientService {
  constructor() {
    this.useCase = new SearchLocalDatabaseUseCase({
      localDatabaseService: new LocalDatabaseService(),
      stateRepository: new LocalDatabaseStateRepository(),
      jsonLinesRepository: new JsonLinesRepository(),
      termService: new SearchTermService(),
    });
  }

  async search(payload) {
    return await this.useCase.execute(payload);
  }

  cancel() {
    this.useCase.cancel();
  }
}
