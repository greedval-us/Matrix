import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";

export class FileDialogHandler {
  constructor(fileService) {
    this.fileService = fileService;
  }

  register() {
    ipcMain.handle("dialog:openFile", wrapHandler("dialog:openFile", () => this.fileService.openFile()));
    ipcMain.handle("dialog:openFolder", wrapHandler("dialog:openFolder", () => this.fileService.openFolder()));

    ipcMain.handle("dialog:saveFile", wrapHandler("dialog:saveFile", (_, { defaultName, filters }) =>
      this.fileService.saveFile(defaultName, filters)
    ));

    ipcMain.handle("file:read", wrapHandler("file:read", (_, filePath) =>
      this.fileService.readFile(filePath)
    ));

    ipcMain.handle("file:write", wrapHandler("file:write", (_, { filePath, data }) =>
      this.fileService.writeFile(filePath, data)
    ));
  }
}
