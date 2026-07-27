import { app, BrowserWindow } from "electron";
import createWindow from "./app.js";
import { IPCManager } from "./ipc/IPCManager.js";

const ipcManager = new IPCManager();

app.whenReady().then(() => {
  createWindow();
  ipcManager.init();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  ipcManager.shutdown();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
