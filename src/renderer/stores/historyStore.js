import { defineStore } from "pinia"
import { reactive, readonly } from "vue"
import { HistoryService } from "../services/HistoryService"

export const useHistoryStore = defineStore("history", () => {
  const historyService = new HistoryService(window.storeAPI)

  const state = reactive({
    history: [],
    isLoading: false
  })

  const loadHistory = async () => {
    state.isLoading = true
    await historyService.loadHistory()
    state.history = historyService.history
    state.isLoading = false
  }

  const addHistoryItem = async (key, value) => {
    state.isLoading = true
    const item = await historyService.addHistoryItem(key, value)
    state.history = historyService.history
    state.isLoading = false
    return item
  }

  const deleteHistoryItem = async (id) => {
    state.isLoading = true
    await historyService.deleteHistoryItem(id)
    state.history = historyService.history
    state.isLoading = false
  }

  const clearHistory = async () => {
    state.isLoading = true
    await historyService.clearHistory()
    state.history = historyService.history
    state.isLoading = false
  }

  return {
    state: readonly(state),
    historyService,
    loadHistory,
    addHistoryItem,
    deleteHistoryItem,
    clearHistory
  }
})
