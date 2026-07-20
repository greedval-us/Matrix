import { ImportLocalDatabaseUseCase } from "../application/localdb/ImportLocalDatabaseUseCase.js";
import { ImportedDocumentFactory } from "../localdb/ImportedDocumentFactory.js";
import { ImportFileReader } from "../localdb/ImportFileReader.js";
import { JsonLinesRepository } from "../localdb/JsonLinesRepository.js";
import { LocalDatabaseGuard } from "../localdb/LocalDatabaseGuard.js";
import { LocalDatabasePaths } from "../localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { OperationCoordinator } from "../localdb/OperationCoordinator.js";
import { LocalDatabaseService } from "./LocalDatabaseService.js";

export class ImportService {
  constructor() {
    this.localDatabaseService = new LocalDatabaseService();
    this.stateRepository = new LocalDatabaseStateRepository();
    this.useCase = new ImportLocalDatabaseUseCase({
      localDatabaseService: this.localDatabaseService,
      guard: new LocalDatabaseGuard(),
      stateRepository: this.stateRepository,
      jsonLinesRepository: new JsonLinesRepository(),
      operationCoordinator: new OperationCoordinator(),
      documentFactory: new ImportedDocumentFactory(),
      importFileReader: new ImportFileReader(),
    });
  }

  async getLastImportStatus() {
    const rootPath = this.localDatabaseService.getStoredRootPath();
    if (!rootPath) return null;

    return await this.stateRepository.readImportState(new LocalDatabasePaths(rootPath));
  }

  async importFolder(folderPath) {
    return await this.useCase.execute(folderPath);
  }
}
