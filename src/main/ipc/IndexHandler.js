import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { IndexService } from "../services/IndexService.js";

export class IndexHandler {
  constructor() {
    this.service = new IndexService();
    this.progressChannel = "index:progress";
  }

  register() {
    ipcMain.handle(
      "index:get-last-status",
      wrapHandler("index:get-last-status", () => this.service.getLastIndexStatus())
    );

    ipcMain.handle(
      "index:cancel",
      wrapHandler("index:cancel", () => this.service.cancelBuild())
    );

    ipcMain.handle(
      "index:build",
      wrapHandler("index:build", (event) =>
        this.service.buildIndexes({
          onProgress: (payload) => event.sender.send(this.progressChannel, payload),
        })
      )
    );
  }

  requestStop(reason = "app-close") {
    this.service.cancelBuild(reason).catch((error) => {
      console.error("Failed to stop index build:", error);
    });
  }
}
