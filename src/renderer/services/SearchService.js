export class SearchService {
  constructor(searchAPI) {
    this.searchAPI = searchAPI;

    this.clients = {};
    this.isSearching = {};
  }

  async createClient(tabId) {
    const status = await this.searchAPI.createClient(tabId);
    this.clients[tabId] = { isConnected: true, status };
    return status;
  }

  async destroyClient(tabId) {
    await this.searchAPI.destroyClient(tabId);
    delete this.clients[tabId];
    delete this.isSearching[tabId];
  }

  async search(tabId, payload, options = {}) {
    if (!this.clients[tabId]) throw new Error(`Client not found for tab ${tabId}`);
    if (this.isSearching[tabId]) throw new Error('Поиск в этой вкладке уже выполняется');
    this.isSearching[tabId] = true;

    const removeProgressListener = this.searchAPI.onProgress((eventPayload) => {
      if (!eventPayload || eventPayload.tabId !== tabId) return;
      options.onProgress?.(eventPayload);
      if (eventPayload.type === 'chunk' && Array.isArray(eventPayload.items)) {
        options.onChunk?.(eventPayload.items, eventPayload.received);
      }
    });

    try {
      return { meta: await this.searchAPI.run(tabId, payload) };
    } finally {
      removeProgressListener();
      this.isSearching[tabId] = false;
    }
  }

  cancelSearch(tabId) {
    if (this.isSearching[tabId]) {
      this.searchAPI.cancel(tabId);
    }
  }

  async listDatabases(payload) {
    return await this.searchAPI.listDatabases(payload);
  }

  async getConfig() {
    return await this.searchAPI.getConfig();
  }

  async setConfig(config) {
    return await this.searchAPI.setConfig(config);
  }

  async testConnection(config) {
    return await this.searchAPI.testConnection(config);
  }

  async getIndexStatus() {
    return await this.searchAPI.getIndexStatus();
  }
}
