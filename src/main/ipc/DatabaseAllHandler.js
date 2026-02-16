import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { DatabaseAllService } from "../services/DatabaseAllService.js";

export class DatabaseAllHandler {
  constructor() {
    this.service = new DatabaseAllService();
  }

  register() {
    ipcMain.handle("grpc:database_all", wrapHandler("grpc:database_all",
      async (_event, payload) => {
        return await this.service.streamDatabaseAll(payload);
      })
    );
  }
}
