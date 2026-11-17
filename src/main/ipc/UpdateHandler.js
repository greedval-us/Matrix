import electron from 'electron';
import path from 'node:path';
import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';
import { registerIpcHandlers } from './registerIpcHandlers.js';

export class UpdateHandler {
  constructor(service, { ipc = electron.ipcMain, app = electron.app, dialog = electron.dialog, windows = electron.BrowserWindow } = {}) {
    Object.assign(this, { service, ipc, app, dialog, windows });
  }

  register() {
    const send = state => {
      for (const window of this.windows.getAllWindows()) if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channels.update.state, state);
    };
    this.service.on('state', send);
    this.unsubscribe = () => this.service.off('state', send);
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.update.getState]: () => this.service.getState(),
      [channels.update.check]: () => this.service.check({ force: true }),
      [channels.update.download]: () => this.service.download(),
      [channels.update.cancel]: () => this.service.cancel(),
      [channels.update.install]: async () => {
        const result = await this.service.install();
        setTimeout(() => this.app.quit(), 100);
        return result;
      },
      [channels.update.saveCopy]: async event => {
        try {
          return await this.service.saveCopy(async name => {
            const options = { title: 'Сохранить новую версию', defaultPath: path.join(this.app.getPath('downloads'), name),
              filters: [{ name: 'Приложение', extensions: [path.extname(name).slice(1)] }] };
            const parent = this.windows.fromWebContents(event.sender);
            const result = parent ? await this.dialog.showSaveDialog(parent, options) : await this.dialog.showSaveDialog(options);
            return result.canceled ? null : result.filePath;
          });
        } catch { throw new Error('Не удалось сохранить обновление. Выберите другую папку или скачайте файл заново.'); }
      },
    });
    this.service.start();
  }

  async shutdown() { this.unregister?.(); this.unsubscribe?.(); await this.service.shutdown(); }
}
