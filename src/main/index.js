import { app, BrowserWindow } from "electron";
import createWindow from "./app.js";
import { IPCManager } from "./ipc/IPCManager.js";
import log from "./utils/logger.js";

const ipcManager = new IPCManager();

app.whenReady().then(() => {
  ipcManager.init();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  void ipcManager.shutdown().catch((error) => log.error("Failed to shut down IPC:", error));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
