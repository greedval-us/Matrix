import electron from "electron";
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import fs from 'node:fs/promises';
import { IPC_CHANNELS as channels } from "../../shared/constants/ipcChannels.js";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";
import { SearchClientService } from "../services/SearchClientService.js";
import { ServerConnectionService } from "../services/ServerConnectionService.js";
import { SearchSessionRegistry } from "../services/SearchSessionRegistry.js";
import { SearchResultSpool } from '../services/SearchResultSpool.js';
import { saveRecordDownload } from '../services/records/recordsLocalFiles.js';
import log from "../utils/logger.js";

export class SearchHandler {
  constructor(storeService, { ipc = electron.ipcMain, wrap = wrapHandler, connectionService, createClient } = {}) {
    this.ipc = ipc;
    this.wrap = wrap;
    this.connectionService = connectionService || new ServerConnectionService(storeService);
    this.results = new Map();
    this.resultCleanups = new Set();
    this.sessions = new SearchSessionRegistry({
      createClient: createClient || ((configOverride) => this.createService(configOverride)),
      onCleanupError: (error) => log.error("Failed to dispose search client:", error),
    });
  }

  createService(configOverride) {
    return new SearchClientService({ connectionService: this.connectionService, configOverride });
  }

  sendProgress(owner, payload) {
    if (!owner.isDestroyed()) owner.send(channels.search.progress, payload);
  }

  async run(owner, tabId, payload, largeResults) {
    const client = this.sessions.get(tabId, owner);
    if (!client) throw new Error(`Клиент поиска не найден для вкладки ${tabId}`);
    if (largeResults === true && /^[0-9]{4,5}%$/u.test(String(payload?.number ?? '').trim())) {
      return this.runLarge(owner, tabId, payload, client);
    }
    let received = 0;
    this.sendProgress(owner, { tabId, type: "started", received });
    const result = await client.search(payload, {
      onChunk: (items) => {
        received += items.filter((item) => item.object_data).length;
        this.sendProgress(owner, { tabId, type: "chunk", items, received });
      },
    });
    this.sendProgress(owner, {
      tabId, type: result.cancelled ? "cancelled" : "completed", meta: result, received,
    });
    return { meta: result, streamed: true };
  }

  async runLarge(owner, tabId, payload, client) {
    if (!Number.isSafeInteger(tabId) || owner.isDestroyed()) throw new Error('Вкладка поиска закрыта');
    if (this.results.get(owner)?.has(tabId)) throw new Error('В этой вкладке уже есть результаты поиска');
    if (!this.results.has(owner)) this.results.set(owner, new Map());
    const entries = this.results.get(owner);
    const entry = { token: randomUUID(), spool: SearchResultSpool.create(), cancelled: false };
    if (!entries.size) {
      entries.onDestroyed = () => {
        for (const id of entries.keys()) void this.clearResults(owner, id).catch(error => log.error(error));
      };
      owner.once('destroyed', entries.onDestroyed);
    }
    entries.set(tabId, entry);
    const spool = await entry.spool.catch(async error => {
      await this.clearResults(owner, tabId).catch(() => {});
      throw error;
    });
    if (entries.get(tabId) !== entry) throw new Error('Вкладка поиска закрыта');
    let received = 0;
    let lastProgressAt = 0;
    const publish = async (type, meta) => {
      const summary = await spool.summary();
      this.sendProgress(owner, { tabId, type, received, meta, largeResults: { ...summary, token: entry.token } });
    };
    await publish('started');
    try {
      const result = entry.cancelled ? { cancelled: true } : await client.search(payload, {
        supportsLargeResults: true,
        onChunk: async items => {
          await spool.append(items);
          received += items.filter(item => item.object_data).length;
          const now = Date.now();
          if (now - lastProgressAt >= 250) {
            lastProgressAt = now;
            await publish('progress');
          }
        },
      });
      const summary = await spool.summary();
      if (!result.cancelled && (!Number.isSafeInteger(Number(result.returned_hits)) ||
          Number(result.returned_hits) !== received || Number(result.total_hits) !== received ||
          received !== summary.recordCount)) {
        throw new Error('Поток результатов завершился до получения всех записей');
      }
      await publish(result.cancelled ? 'cancelled' : 'completed', result);
      return { meta: result, streamed: true };
    } catch (error) {
      if (entries.get(tabId) === entry) await publish('progress').catch(() => {});
      throw error;
    }
  }

  async getResults(owner, tabId, token) {
    const entry = this.results.get(owner)?.get(tabId);
    if (!entry || entry.token !== token) throw new Error('Результаты поиска недоступны');
    return entry.spool;
  }

  async clearResults(owner, tabId) {
    const entries = this.results.get(owner);
    const entry = entries?.get(tabId);
    if (!entry) return;
    entries.delete(tabId);
    if (!entries.size) {
      this.results.delete(owner);
      owner.removeListener('destroyed', entries.onDestroyed);
    }
    const cleanup = entry.spool.then(spool => spool.close());
    this.resultCleanups.add(cleanup);
    try { await cleanup; }
    finally { this.resultCleanups.delete(cleanup); }
  }

  cancel(owner, tabId) {
    const entry = this.results.get(owner)?.get(tabId);
    if (entry) entry.cancelled = true;
    this.sessions.get(tabId, owner)?.cancel();
  }

  async exportResults(owner, tabId, token, format) {
    if (format !== 'csv' && format !== 'txt') throw new Error('Недопустимый формат экспорта');
    const spool = await this.getResults(owner, tabId, token);
    return saveRecordDownload({
      name: `matrix-results.${format}`,
      stream: Readable.from(spool.export(format)),
    }, { dialog: electron.dialog, fileSystem: fs, createId: randomUUID });
  }

  register() {
    this.unregister?.();
    const temporary = (event, operation, config) => this.sessions.withTemporary(event.sender, operation, config);
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.search.createClient]: (event, tabId) => this.sessions.create(tabId, event.sender),
      [channels.search.run]: (event, tabId, payload, largeResults) => this.run(event.sender, tabId, payload, largeResults),
      [channels.search.readResults]: async (event, tabId, token, source, start, limit) => (
        await this.getResults(event.sender, tabId, token)).read(source, start, limit),
      [channels.search.clearResults]: (event, tabId) => this.clearResults(event.sender, tabId),
      [channels.search.exportResults]: (event, tabId, token, format) => this.exportResults(event.sender, tabId, token, format),
      [channels.search.destroyClient]: async (event, tabId) => { await this.sessions.destroy(tabId, event.sender); return true; },
      [channels.search.listDatabases]: (event, payload) => temporary(event, (client) => client.listDatabases(payload)),
      [channels.search.getConfig]: () => this.connectionService.getPublicConfig(),
      [channels.search.setConfig]: async (_event, config) => {
        const result = await this.connectionService.updateConfig(config);
        await this.sessions.reset();
        return result;
      },
      [channels.search.testConnection]: (event, config) => temporary(event, (client) => client.connect(), config),
      [channels.search.getIndexStatus]: (event) => temporary(event, (client) => client.connect()),
    }, {
      [channels.search.cancel]: (event, tabId) => this.cancel(event.sender, tabId),
    }, this.wrap);
  }

  async shutdown() {
    this.unregister?.();
    const results = await Promise.allSettled([this.sessions.reset(), ...this.resultCleanups, ...[...this.results].flatMap(([owner, entries]) => (
      [...entries.keys()].map(tabId => this.clearResults(owner, tabId))
    ))]);
    for (const result of results) if (result.status === 'rejected') log.error(result.reason);
  }
}
