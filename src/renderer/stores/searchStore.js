import { defineStore } from 'pinia';
import { SearchService } from '../services/SearchService.js';
import { usePendingOperations } from './usePendingOperations.js';

export const useSearchStore = defineStore('search', () => {
  const searchService = new SearchService();
  const { state, publicState, run: withLoading } = usePendingOperations({ clients: {}, isSearching: {}, indexStatus: null });
  const createClient = (tabId) => withLoading(async () => {
    const status = await searchService.createClient(tabId);
    state.clients[tabId] = searchService.clients[tabId];
    state.indexStatus = status;
    return status;
  });
  const destroyClient = (tabId) => withLoading(async () => {
    await searchService.destroyClient(tabId);
    delete state.clients[tabId];
    delete state.isSearching[tabId];
  });
  async function search(tabId, payload, options = {}) {
    state.isSearching[tabId] = true;
    try { return await searchService.search(tabId, payload, options); }
    finally { state.isSearching[tabId] = Boolean(searchService.isSearching[tabId]); }
  }
  const cancelSearch = (tabId) => searchService.cancelSearch(tabId);
  const listDatabases = (payload) => withLoading(() => searchService.listDatabases(payload));
  const getConfig = () => searchService.getConfig();
  const setConfig = (config) => searchService.setConfig(config);
  const testConnection = (config) => searchService.testConnection(config);
  async function getIndexStatus() {
    state.indexStatus = await searchService.getIndexStatus();
    return state.indexStatus;
  }
  return {
    state: publicState, searchService, createClient, destroyClient, search, baseSearch: search,
    cancelSearch, listDatabases, databaseAll: listDatabases, getConfig, setConfig, testConnection, getIndexStatus,
  };
});
