import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";
import { SearchClientService } from "../services/SearchClientService.js";

export class SearchHandler {
  constructor() {
    this.clients = new Map();
  }

  register() {
    const createClient = (_event, tabId, endpoint) => {
      const service = new SearchClientService(endpoint);
      this.clients.set(tabId, service);
      return true;
    };

    const runSearch = async (_event, tabId, payload) => {
      const client = this.clients.get(tabId);
      if (!client) throw new Error(`Search client not found for tab ${tabId}`);
      return await client.search(payload);
    };

    const destroyClient = (_event, tabId) => {
      this.clients.delete(tabId);
      return true;
    };

    ipcMain.handle(
      "search:create-client",
      wrapHandler("search:create-client", createClient)
    );
    ipcMain.handle("search:run", wrapHandler("search:run", runSearch));
    ipcMain.on("search:cancel", (_event, tabId) => {
      const client = this.clients.get(tabId);
      if (client) client.cancel();
    });
    ipcMain.handle(
      "search:destroy-client",
      wrapHandler("search:destroy-client", destroyClient)
    );

    ipcMain.handle(
      "grpc:create-search-client",
      wrapHandler("grpc:create-search-client", createClient)
    );
    ipcMain.handle(
      "grpc:base_search",
      wrapHandler("grpc:base_search", runSearch)
    );
    ipcMain.on("grpc:cancel-search", (_event, tabId) => {
      const client = this.clients.get(tabId);
      if (client) client.cancel();
    });
    ipcMain.handle(
      "grpc:destroy-search-client",
      wrapHandler("grpc:destroy-search-client", destroyClient)
    );
  }
}
