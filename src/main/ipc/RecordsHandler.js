import electron from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC_CHANNELS as channels } from '../../shared/constants/ipcChannels.js';
import { registerIpcHandlers } from './registerIpcHandlers.js';
import { wrapHandler } from '../utils/ipcWrapper.js';

const rendererPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build/renderer/index.html');

export function assertRecordsSender(event, { filePath = rendererPath, devServerUrl = !electron.app?.isPackaged && process.env.MATRIX_DEV_SERVER_URL } = {}) {
  if (!event?.senderFrame || (event.sender?.mainFrame && event.senderFrame !== event.sender.mainFrame)) throw new Error('Недопустимый источник запроса');
  try {
    const url = new URL(event.senderFrame.url);
    if (url.protocol === 'file:') {
      const actual = path.resolve(fileURLToPath(url));
      const expected = path.resolve(filePath);
      if (process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected) return;
    }
    if (devServerUrl && ['http:', 'https:'].includes(url.protocol) && url.origin === new URL(devServerUrl).origin) return;
  } catch {}
  throw new Error('Недопустимый источник запроса');
}

export class RecordsHandler {
  constructor(service, { ipc = electron.ipcMain, wrap = wrapHandler, assertSender = assertRecordsSender } = {}) {
    this.service = service;
    this.ipc = ipc;
    this.wrap = wrap;
    this.assertSender = assertSender;
  }

  register() {
    this.unregister?.();
    const request = (operation) => (event, payload) => {
      this.assertSender(event);
      return this.service[operation](payload);
    };
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.records.getCapabilities]: request('getCapabilities'),
      [channels.records.list]: request('list'),
      [channels.records.uploadFiles]: request('uploadFiles'),
      [channels.records.downloadFile]: request('downloadFile'),
      [channels.records.removeFile]: request('removeFile'),
    }, {}, this.wrap);
  }

  shutdown() { this.unregister?.(); }
}
