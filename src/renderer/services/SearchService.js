export class SearchService {
  constructor(searchAPI) {
    this.searchAPI = searchAPI;

    this.clients = {};
    this.searchResults = {};
    this.isSearching = {};
  }

  async createClient(tabId, endpoint) {
    await this.searchAPI.createClient(tabId, endpoint);
    this.clients[tabId] = { endpoint, isConnected: true };
  }

  async destroyClient(tabId) {
    await this.searchAPI.destroyClient(tabId);
    delete this.clients[tabId];
    delete this.searchResults[tabId];
    delete this.isSearching[tabId];
  }

  async search(tabId, payload) {
    if (!this.clients[tabId]) throw new Error(`Client not found for tab ${tabId}`);
    this.isSearching[tabId] = true;
    try {
      const results = await this.searchAPI.run(tabId, payload);
      this.searchResults[tabId] = results;
      return results;
    } finally {
      this.isSearching[tabId] = false;
    }
  }

  cancelSearch(tabId) {
    if (this.isSearching[tabId]) {
      this.searchAPI.cancel(tabId);
      this.isSearching[tabId] = false;
    }
  }

  async listDatabases(payload) {
    return await this.searchAPI.listDatabases(payload);
  }
}
