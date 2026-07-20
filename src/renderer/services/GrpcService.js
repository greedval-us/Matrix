import { SearchService } from "./SearchService";

export class GrpcService extends SearchService {
  constructor(grpcAPI) {
    const searchAPI = grpcAPI
      ? {
          createClient: (tabId, endpoint) => grpcAPI.createSearchClient(tabId, endpoint),
          run: (tabId, payload) => grpcAPI.baseSearch(tabId, payload),
          cancel: (tabId) => grpcAPI.cancelSearch(tabId),
          destroyClient: (tabId) => grpcAPI.destroySearchClient(tabId),
          listDatabases: (payload) => grpcAPI.databaseAll(payload),
        }
      : window.searchAPI;

    super(searchAPI);
  }

  async baseSearch(tabId, payload) {
    return await this.search(tabId, payload);
  }

  async databaseAll(payload) {
    return await this.listDatabases(payload);
  }
}
