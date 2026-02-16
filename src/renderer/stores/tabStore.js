// stores/tabStore.js
import { defineStore } from "pinia"
import { ref, reactive } from "vue"

export const useTabStore = defineStore("tabs", () => {
  const state = ref({
    tabs: [],
    activeTabId: null,
    editingTabId: null,
    editTitle: '',
    searchStates: {}
  })

  // ========================
  // Инициализация первой вкладки
  // ========================
  const initializeFirstTab = (initialSearch = '') => {
    state.value.tabs = []
    state.value.activeTabId = null
    state.value.editingTabId = null
    state.value.editTitle = ''
    state.value.searchStates = {}

    const firstTab = { id: Date.now(), title: initialSearch || 'вкладка', key: Date.now() }
    state.value.tabs = [firstTab]
    state.value.activeTabId = firstTab.id
    state.value.searchStates[firstTab.id] = reactive({
      selectedFields: {},
      collapsedFields: {},
      results: [],
      loading: false,
      searchValue: initialSearch
    })
  }

  // ========================
  // Actions
  // ========================
  const addTab = (searchValue = '') => {
    const newTab = { id: Date.now(), title: searchValue || 'вкладка', key: Date.now() }
    state.value.tabs.push(newTab)
    state.value.activeTabId = newTab.id
    state.value.searchStates[newTab.id] = reactive({
      selectedFields: {},
      collapsedFields: {},
      results: [],
      loading: false,
      searchValue
    })
  }

  const closeTab = (id) => {
    if (state.value.tabs.length <= 1) return
    const index = state.value.tabs.findIndex(t => t.id === id)
    if (index === -1) return
    state.value.tabs.splice(index, 1)
    delete state.value.searchStates[id]
    if (state.value.activeTabId === id) {
      state.value.activeTabId = state.value.tabs[Math.max(0, index - 1)].id
    }
  }

  const setActive = (id) => {
    state.value.activeTabId = id
    if (!state.value.searchStates[id]) {
      state.value.searchStates[id] = reactive({
        selectedFields: {},
        collapsedFields: {},
        results: [],
        loading: false,
        searchValue: ''
      })
    }
  }

  const getSearchState = (tabId) => {
    if (!state.value.searchStates[tabId]) {
      state.value.searchStates[tabId] = reactive({
        selectedFields: {},
        collapsedFields: {},
        results: [],
        loading: false,
        searchValue: ''
      })
    }
    return state.value.searchStates[tabId]
  }

  // ========================
  // Редактирование заголовка вкладки вручную
  // ========================
  const startEdit = (tab) => {
    state.value.editingTabId = tab.id
    state.value.editTitle = tab.title
  }

  const finishEdit = (tab) => {
    const t = state.value.tabs.find(t => t.id === tab.id)
    if (t) t.title = state.value.editTitle || t.title
    state.value.editingTabId = null
    state.value.editTitle = ''
  }

  const updateEditTitle = (value) => {
    state.value.editTitle = value
  }

  // ========================
  // Обновление названия вкладки по поисковому запросу
  // ========================
  const updateTabTitleBySearch = (tabId, searchValue) => {
    const t = state.value.tabs.find(t => t.id === tabId)
    if (t && !state.value.editingTabId) { // не менять, если редактируем вручную
      t.title = searchValue || t.title
      if (state.value.searchStates[tabId]) {
        state.value.searchStates[tabId].searchValue = searchValue
      }
    }
  }

  const resetTabs = () => {
    initializeFirstTab()
  }

  return {
    state,
    addTab,
    closeTab,
    setActive,
    startEdit,
    finishEdit,
    updateEditTitle,
    updateTabTitleBySearch,
    resetTabs,
    getSearchState
  }
})
