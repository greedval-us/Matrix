import { BrowserWindow, Menu, app } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { showWindowAfterSplash } from "./windowLifecycle.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicPath = (...segments) => path.join(moduleDirectory, "..", "public", ...segments);

export default function createWindow() {
  const splash = new BrowserWindow({
    width: 400, height: 300, transparent: true, frame: false,
    alwaysOnTop: true, center: true, resizable: false,
    icon: publicPath("matrix.ico"), show: true,
  });
  splash.loadFile(publicPath("splash.html"));

  const main = new BrowserWindow({
    width: 1200, height: 700, minWidth: 820, minHeight: 560,
    show: false, backgroundColor: "#f5f5f7", icon: publicPath("matrix.ico"),
    webPreferences: {
      preload: path.resolve(moduleDirectory, "../../build/main/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  showWindowAfterSplash(main, splash);
  Menu.setApplicationMenu(null);

  const devServerUrl = !app.isPackaged && process.env.MATRIX_DEV_SERVER_URL;
  const loading = devServerUrl
    ? main.loadURL(devServerUrl)
    : main.loadFile(path.resolve(moduleDirectory, "../../build/renderer/index.html"));
  loading.catch((error) => console.error("Failed to load Matrix:", error));
  if (devServerUrl && process.env.MATRIX_DEVTOOLS === "1") main.webContents.openDevTools({ mode: "detach" });
  return main;
}
