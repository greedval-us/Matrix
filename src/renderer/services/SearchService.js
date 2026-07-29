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

  async search(tabId, payload, options = {}) {
    if (!this.clients[tabId]) throw new Error(`Client not found for tab ${tabId}`);
    this.isSearching[tabId] = true;
    this.searchResults[tabId] = [];

    const removeProgressListener = this.searchAPI.onProgress((eventPayload) => {
      if (!eventPayload || eventPayload.tabId !== tabId) return;
      if (eventPayload.type !== "chunk" || !Array.isArray(eventPayload.items)) return;

      this.searchResults[tabId].push(...eventPayload.items);
      options.onChunk?.(eventPayload.items);
    });

    try {
      const meta = await this.searchAPI.run(tabId, payload);
      return {
        items: this.searchResults[tabId],
        meta,
      };
    } finally {
      removeProgressListener();
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
