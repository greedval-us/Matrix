import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { DatabaseCatalogService } from "../services/DatabaseCatalogService.js";

export class DatabaseCatalogHandler {
  constructor() {
    this.service = new DatabaseCatalogService();
  }

  register() {
    const listDatabases = async (_event, payload) => {
      return await this.service.list(payload);
    };

    ipcMain.handle(
      "search:list-databases",
      wrapHandler("search:list-databases", listDatabases)
    );
    ipcMain.handle(
      "grpc:database_all",
      wrapHandler("grpc:database_all", listDatabases)
    );
  }
}
