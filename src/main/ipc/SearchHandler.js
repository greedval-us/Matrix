import electron from "electron";
import { IPC_CHANNELS as channels } from "../../shared/constants/ipcChannels.js";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";
import { SearchClientService } from "../services/SearchClientService.js";
import { ServerConnectionService } from "../services/ServerConnectionService.js";
import { SearchSessionRegistry } from "../services/SearchSessionRegistry.js";
import log from "../utils/logger.js";

export class SearchHandler {
  constructor(storeService, { ipc = electron.ipcMain, wrap = wrapHandler, connectionService, createClient } = {}) {
    this.ipc = ipc;
    this.wrap = wrap;
    this.connectionService = connectionService || new ServerConnectionService(storeService);
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

  async run(owner, tabId, payload) {
    const client = this.sessions.get(tabId, owner);
    if (!client) throw new Error(`Клиент поиска не найден для вкладки ${tabId}`);
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
    return result;
  }

  register() {
    this.unregister?.();
    const temporary = (event, operation, config) => this.sessions.withTemporary(event.sender, operation, config);
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.search.createClient]: (event, tabId) => this.sessions.create(tabId, event.sender),
      [channels.search.run]: (event, tabId, payload) => this.run(event.sender, tabId, payload),
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
      [channels.search.cancel]: (event, tabId) => this.sessions.get(tabId, event.sender)?.cancel(),
    }, this.wrap);
  }

  async shutdown() {
    this.unregister?.();
    await this.sessions.reset();
  }
}
