import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { BaseSearchService } from "../services/BaseSearchService.js";

export class BaseSearchHandler {
  constructor() {
    this.clients = new Map();
  }

  register() {
    ipcMain.handle("grpc:create-search-client", wrapHandler("grpc:create-search-client",
      (_event, tabId, serverAddress) => {
        const service = new BaseSearchService(serverAddress);
        this.clients.set(tabId, service);
        return true;
      })
    );

    ipcMain.handle("grpc:base_search", wrapHandler("grpc:base_search",
      async (_event, tabId, payload) => {
        const client = this.clients.get(tabId);
        if (!client) throw new Error(`Search client not found for tab ${tabId}`);
        return await client.streamSearch(payload);
      })
    );

    ipcMain.on("grpc:cancel-search", (_event, tabId) => {
      const client = this.clients.get(tabId);
      if (client) client.cancel();
    });

    ipcMain.handle("grpc:destroy-search-client", wrapHandler("grpc:destroy-search-client",
      (_event, tabId) => {
        this.clients.delete(tabId);
        return true;
      })
    );
  }
}
