import { defineStore } from 'pinia';
import { HistoryService } from '../services/HistoryService.js';
import { usePendingOperations } from './usePendingOperations.js';

export const useHistoryStore = defineStore('history', () => {
  const service = new HistoryService();
  const { state, publicState, run } = usePendingOperations({ history: [] });

  const loadHistory = () => run(async () => { state.history = await service.loadHistory(); });
  const addHistoryItem = (key, value) => run(async () => {
    const item = await service.addHistoryItem(key, value);
    state.history.unshift(item);
    return item;
  });
  const deleteHistoryItem = id => run(async () => {
    await service.deleteHistoryItem(id);
    state.history = state.history.filter(item => item.id !== id);
  });
  const clearHistory = () => run(async () => {
    await service.clearHistory();
    state.history = [];
  });

  return { state: publicState, loadHistory, addHistoryItem, deleteHistoryItem, clearHistory };
});
