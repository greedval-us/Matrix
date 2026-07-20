import { defineStore } from "pinia";
import { reactive, readonly } from "vue";
import { SearchService } from "../services/SearchService";

export const useSearchStore = defineStore("search", () => {
  const searchService = new SearchService(window.searchAPI);

  const state = reactive({
    clients: {},
    searchResults: {},
    isSearching: {},
    isLoading: false,
  });

  const createClient = async (tabId, endpoint) => {
    state.isLoading = true;
    try {
      await searchService.createClient(tabId, endpoint);
      state.clients[tabId] = searchService.clients[tabId];
    } finally {
      state.isLoading = false;
    }
  };

  const destroyClient = async (tabId) => {
    state.isLoading = true;
    try {
      await searchService.destroyClient(tabId);
      delete state.clients[tabId];
      delete state.searchResults[tabId];
      delete state.isSearching[tabId];
    } finally {
      state.isLoading = false;
    }
  };

  const search = async (tabId, payload) => {
    state.isSearching[tabId] = true;
    try {
      const results = await searchService.search(tabId, payload);
      state.searchResults[tabId] = results;
      return results;
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
  };
});

export const useGrpcStore = useSearchStore;
