import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { SearchClientService } from "../services/SearchClientService.js";
import { ServerConnectionService } from "../services/ServerConnectionService.js";

export class SearchHandler {
  constructor(storeService) {
    this.clients = new Map();
    this.connectionService = new ServerConnectionService(storeService);
  }

  createService(configOverride) {
    return new SearchClientService({ connectionService: this.connectionService, configOverride });
  }

  async disposeClients() {
    await Promise.all([...this.clients.values()].map((client) => client.dispose()));
    this.clients.clear();
  }

  register() {
    ipcMain.handle(
      "search:create-client",
      wrapHandler("search:create-client", async (_event, tabId) => {
        await this.clients.get(tabId)?.dispose();
        const service = this.createService();
        const status = await service.connect();
        this.clients.set(tabId, service);
        return status;
      })
    );

    ipcMain.handle(
      "search:run",
      wrapHandler("search:run", async (event, tabId, payload) => {
        const client = this.clients.get(tabId);
        if (!client) throw new Error(`Клиент поиска не найден для вкладки ${tabId}`);
        let received = 0;
        event.sender.send("search:progress", { tabId, type: "started", received });
        const result = await client.search(payload, {
          onChunk: (items) => {
            received += items.filter((item) => item.object_data).length;
            event.sender.send("search:progress", {
              tabId,
              type: "chunk",
              items,
              received,
            });
          },
        });
        event.sender.send("search:progress", {
          tabId,
          type: result.cancelled ? "cancelled" : "completed",
          meta: result,
          received,
        });
        return result;
      })
    );

    ipcMain.on("search:cancel", (_event, tabId) => this.clients.get(tabId)?.cancel());
    ipcMain.handle(
      "search:destroy-client",
      wrapHandler("search:destroy-client", async (_event, tabId) => {
        await this.clients.get(tabId)?.dispose();
        this.clients.delete(tabId);
        return true;
      })
    );

    ipcMain.handle(
      "search:list-databases",
      wrapHandler("search:list-databases", async (_event, payload) => {
        const service = this.createService();
        try {
          return await service.listDatabases(payload);
        } finally {
          await service.dispose();
        }
      })
    );
    ipcMain.handle(
      "search:get-config",
      wrapHandler("search:get-config", () => this.connectionService.getPublicConfig())
    );
    ipcMain.handle(
      "search:set-config",
      wrapHandler("search:set-config", async (_event, config) => {
        const result = await this.connectionService.updateConfig(config);
        await this.disposeClients();
        return result;
      })
    );
    ipcMain.handle(
      "search:test-connection",
      wrapHandler("search:test-connection", async (_event, config) => {
        const service = this.createService(config);
        try {
          return await service.connect();
        } finally {
          await service.dispose();
        }
      })
    );
    ipcMain.handle(
      "search:get-index-status",
      wrapHandler("search:get-index-status", async () => {
        const service = this.createService();
        try {
          return await service.connect();
        } finally {
          await service.dispose();
        }
      })
    );
  }

  shutdown() {
    for (const client of this.clients.values()) client.dispose();
    this.clients.clear();
  }
}
