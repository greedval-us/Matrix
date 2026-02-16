export class GrpcService {
  constructor(grpcAPI) {
    this.grpcAPI = grpcAPI;

    this.clients = {};
    this.searchResults = {};
    this.isSearching = {};
  }

  async createClient(tabId, serverAddress) {
    await this.grpcAPI.createSearchClient(tabId, serverAddress);
    this.clients[tabId] = { serverAddress, isConnected: true };
  }

  async destroyClient(tabId) {
    await this.grpcAPI.destroySearchClient(tabId);
    delete this.clients[tabId];
    delete this.searchResults[tabId];
    delete this.isSearching[tabId];
  }

  async baseSearch(tabId, payload) {
    if (!this.clients[tabId]) throw new Error(`Client not found for tab ${tabId}`);
    this.isSearching[tabId] = true;
    try {
      const results = await this.grpcAPI.baseSearch(tabId, payload);
      this.searchResults[tabId] = results;
      return results;
    } finally {
      this.isSearching[tabId] = false;
    }
  }

  cancelSearch(tabId) {
    if (this.isSearching[tabId]) {
      this.grpcAPI.cancelSearch(tabId);
      this.isSearching[tabId] = false;
    }
  }

  async databaseAll(payload) {
    return await this.grpcAPI.databaseAll(payload);
  }
}
