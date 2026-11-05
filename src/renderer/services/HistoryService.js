import { getStoreApi } from '../infrastructure/desktopApi.js';

export class HistoryService {
  constructor(storeAPI = getStoreApi()) { this.storeAPI = storeAPI; }
  loadHistory() { return this.storeAPI.getHistory(); }
  addHistoryItem(key, value) { return this.storeAPI.addHistoryItem(key, value); }
  deleteHistoryItem(id) { return this.storeAPI.deleteHistoryItem(id); }
  clearHistory() { return this.storeAPI.clearHistory(); }
}
