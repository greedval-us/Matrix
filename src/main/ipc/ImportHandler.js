import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { ImportService } from "../services/ImportService.js";

export class ImportHandler {
  constructor() {
    this.service = new ImportService();
  }

  register() {
    ipcMain.handle(
      "import:get-last-status",
      wrapHandler("import:get-last-status", () => this.service.getLastImportStatus())
    );

    ipcMain.handle(
      "import:run-folder",
      wrapHandler("import:run-folder", (_event, folderPath) =>
        this.service.importFolder(folderPath)
      )
    );
  }
}
