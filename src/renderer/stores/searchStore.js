import { defineStore } from "pinia";
import { reactive, readonly } from "vue";
import { SearchService } from "../services/SearchService";

export const useSearchStore = defineStore("search", () => {
  const searchService = new SearchService(window.searchAPI);

  const state = reactive({
    clients: {},
    isSearching: {},
    isLoading: false,
    indexStatus: null,
  });

  const createClient = async (tabId) => {
    state.isLoading = true;
    try {
      const status = await searchService.createClient(tabId);
      state.clients[tabId] = searchService.clients[tabId];
      state.indexStatus = status;
      return status;
    } finally {
      state.isLoading = false;
    }
  };

  const destroyClient = async (tabId) => {
    state.isLoading = true;
    try {
      await searchService.destroyClient(tabId);
      delete state.clients[tabId];
      delete state.isSearching[tabId];
    } finally {
      state.isLoading = false;
    }
  };

  const search = async (tabId, payload, options = {}) => {
    state.isSearching[tabId] = true;
    try {
      return await searchService.search(tabId, payload, options);
    } finally {
      state.isSearching[tabId] = false;
    }
  };

  const cancelSearch = (tabId) => {
    searchService.cancelSearch(tabId);
    state.isSearching[tabId] = false;
  };

  const listDatabases = async (payload) => {
    state.isLoading = true;
    try {
      return await searchService.listDatabases(payload);
    } finally {
      state.isLoading = false;
    }
  };

  const getConfig = () => searchService.getConfig();
  const setConfig = (config) => searchService.setConfig(config);
  const testConnection = (config) => searchService.testConnection(config);
  const getIndexStatus = async () => {
    state.indexStatus = await searchService.getIndexStatus();
    return state.indexStatus;
  };

  return {
    state: readonly(state),
    searchService,
    createClient,
    destroyClient,
    search,
    baseSearch: search,
    cancelSearch,
    listDatabases,
    databaseAll: listDatabases,
    getConfig,
    setConfig,
    testConnection,
    getIndexStatus,
  };
});
