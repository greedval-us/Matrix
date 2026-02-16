import { defineStore } from "pinia"
import { reactive, readonly } from "vue"
import { GrpcService } from "../services/GrpcService"

export const useGrpcStore = defineStore("grpc", () => {
  const grpcService = new GrpcService(window.grpcAPI)

  const state = reactive({
    clients: {},
    searchResults: {},
    isSearching: {},
    isLoading: false,
  })

  // ========================
  // Клиенты
  // ========================
  const createClient = async (tabId) => {
    state.isLoading = true
    try {
      await grpcService.createClient(tabId)
      state.clients[tabId] = grpcService.clients[tabId]
    } finally {
      state.isLoading = false
    }
  }

  const destroyClient = async (tabId) => {
    state.isLoading = true
    try {
      await grpcService.destroyClient(tabId)
      delete state.clients[tabId]
      delete state.searchResults[tabId]
      delete state.isSearching[tabId]
    } finally {
      state.isLoading = false
    }
  }

  // ========================
  // Поиск
  // ========================
  const baseSearch = async (tabId, payload) => {
    state.isSearching[tabId] = true
    try {
      const results = await grpcService.baseSearch(tabId, payload)
      state.searchResults[tabId] = results
      return results
    } finally {
      state.isSearching[tabId] = false
    }
  }

  const cancelSearch = (tabId) => {
    grpcService.cancelSearch(tabId)
    state.isSearching[tabId] = false
  }

  // ========================
  // Работа с базами данных
  // ========================
  const databaseAll = async (payload) => {
    state.isLoading = true
    try {
      return await grpcService.databaseAll(payload)
    } finally {
      state.isLoading = false
    }
  }

  return {
    state: readonly(state),
    grpcService,
    createClient,
    destroyClient,
    baseSearch,
    cancelSearch,
    databaseAll,
  }
})
