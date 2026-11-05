import electron from "electron";
import { IPC_CHANNELS as channels } from "../../shared/constants/ipcChannels.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";
import { wrapHandler } from "../utils/ipcWrapper.js";

export class FileDialogHandler {
  constructor(fileService, { ipc = electron.ipcMain, wrap = wrapHandler } = {}) {
    this.fileService = fileService;
    this.ipc = ipc;
    this.wrap = wrap;
  }

  register() {
    this.unregister?.();
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.dialog.openFile]: () => this.fileService.openFile(),
      [channels.dialog.openCertificate]: () => this.fileService.openCertificate(),
      [channels.dialog.openFolder]: () => this.fileService.openFolder(),
      [channels.dialog.saveFile]: (_, { defaultName, filters } = {}) => this.fileService.saveFile(defaultName, filters),
      [channels.file.read]: (_, filePath) => this.fileService.readFile(filePath),
      [channels.file.write]: (_, { filePath, data, isBinary }) => this.fileService.writeFile(filePath, data, isBinary),
    }, {}, this.wrap);
  }

  shutdown() { this.unregister?.(); }
}
