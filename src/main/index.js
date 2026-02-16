import { app, BrowserWindow } from "electron";
import createWindow from "./app.js";
import { IPCManager } from "./ipc/IPCManager.js";

app.whenReady().then(() => {
  createWindow();

  const ipcManager = new IPCManager();
  ipcManager.init();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});