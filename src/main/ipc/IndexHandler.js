import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { IndexService } from "../services/IndexService.js";

export class IndexHandler {
  constructor() {
    this.service = new IndexService();
  }

  register() {
    ipcMain.handle(
      "index:get-last-status",
      wrapHandler("index:get-last-status", () => this.service.getLastIndexStatus())
    );

    ipcMain.handle(
      "index:build",
      wrapHandler("index:build", () => this.service.buildIndexes())
    );
  }
}
