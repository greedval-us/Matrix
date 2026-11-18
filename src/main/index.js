import { app, BrowserWindow } from "electron";
import createWindow from "./app.js";
import { IPCManager } from "./ipc/IPCManager.js";
import log from "./utils/logger.js";
import { configureProfilePaths } from "./profilePaths.js";
import { acknowledgePortableUpdate } from "./services/updates/PortableInstaller.js";
import { cleanupLegacyPortableBackup } from "./services/updates/legacyPortableBackup.js";

configureProfilePaths(app);
const ipcManager = new IPCManager();

app.whenReady().then(() => {
  ipcManager.init();
  const mainWindow = createWindow();
  mainWindow.webContents.once('did-finish-load', () => {
    if (!app.isPackaged || process.platform !== 'win32') return;
    void mainWindow.webContents.executeJavaScript('Boolean(document.querySelector("#app")?.firstElementChild)')
      .then(async (mounted) => {
        if (!mounted || mainWindow.isDestroyed()) throw new Error('Updated application interface did not mount.');
        await acknowledgePortableUpdate({ app });
        await cleanupLegacyPortableBackup({ app });
      }).catch((error) => log.error('Could not confirm portable update startup:', error));
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let shutdownStarted = false;
let shutdownFinished = false;
app.on("before-quit", (event) => {
  if (shutdownFinished) return;
  event.preventDefault();
  if (shutdownStarted) return;
  shutdownStarted = true;
  void ipcManager.shutdown().catch((error) => log.error("Failed to shut down IPC:", error)).finally(() => {
    shutdownFinished = true;
    app.quit();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
