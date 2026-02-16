import { BrowserWindow, Menu, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let win;
let splash;

export default function createWindow() {
  splash = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    resizable: false,
    icon: path.join(__dirname, '..', 'public', 'matrix.ico'),
    show: true,
  });

  splash.loadFile(path.join(__dirname, '..', 'public', 'splash.html'));

  win = new BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 1200,
    minHeight: 700,
    show: false,
    icon: path.join(__dirname, '..', 'public', 'matrix.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  Menu.setApplicationMenu(null);

  const isDev = !app.isPackaged;

  if (isDev) {
    win.loadURL('http://localhost:5173').catch(err =>
      console.error('Failed to load dev server:', err)
    );
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html')).catch(err =>
      console.error('Failed to load index.html:', err)
    );
  }

  const minSplashTime = 2000;
  const splashStart = Date.now();

  win.once('ready-to-show', () => {
    const elapsed = Date.now() - splashStart;
    const delay = Math.max(0, minSplashTime - elapsed);

    setTimeout(() => {
      if (splash && !splash.isDestroyed()) splash.destroy();
      win.show();

    }, delay);
  });
}
