import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { LocalDatabaseService } from "../services/LocalDatabaseService.js";

export class LocalDatabaseHandler {
  constructor() {
    this.service = new LocalDatabaseService();
  }

  register() {
    ipcMain.handle(
      "database-storage:get-root-path",
      wrapHandler("database-storage:get-root-path", () =>
        this.service.getStoredRootPath()
      )
    );

    ipcMain.handle(
      "database-storage:set-root-path",
      wrapHandler("database-storage:set-root-path", (_event, rootPath) =>
        this.service.setStoredRootPath(rootPath)
      )
    );

    ipcMain.handle(
      "database-storage:get-status",
      wrapHandler("database-storage:get-status", (_event, rootPath) =>
        this.service.getStatus(rootPath)
      )
    );

    ipcMain.handle(
      "database-storage:initialize",
      wrapHandler("database-storage:initialize", (_event, rootPath) =>
        this.service.initialize(rootPath)
      )
    );
  }
}
