import { defineStore } from 'pinia';
import { ref } from 'vue';
import { createSearchState } from '../utils/searchState.js';
import { createMonotonicIdGenerator } from '../utils/monotonicId.js';
export { createSearchState } from '../utils/searchState.js';

const nextTabId = createMonotonicIdGenerator();

export const useTabStore = defineStore('tabs', () => {
  const state = ref({
    tabs: [],
    activeTabId: null,
    editingTabId: null,
    editTitle: '',
    searchStates: {},
  });

  function addTab(searchValue = '') {
    const tab = { id: nextTabId(), title: searchValue || 'Новый поиск' };
    state.value.tabs.push(tab);
    state.value.searchStates[tab.id] = createSearchState(searchValue);
    state.value.activeTabId = tab.id;
    return tab.id;
  }

  function closeTab(id) {
    if (state.value.tabs.length <= 1) return;
    const index = state.value.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return;
    state.value.tabs.splice(index, 1);
    delete state.value.searchStates[id];
    if (state.value.activeTabId === id)
      state.value.activeTabId = state.value.tabs[Math.max(0, index - 1)].id;
    if (state.value.editingTabId === id) state.value.editingTabId = null;
  }

  function setActive(id) {
    if (state.value.tabs.some((tab) => tab.id === id)) state.value.activeTabId = id;
  }

  function getSearchState(id) {
    return state.value.searchStates[id];
  }

  function startEdit(tab) {
    state.value.editingTabId = tab.id;
    state.value.editTitle = tab.title;
  }

  function finishEdit(tab) {
    const current = state.value.tabs.find((item) => item.id === tab.id);
    if (current) current.title = state.value.editTitle.trim() || current.title;
    state.value.editingTabId = null;
    state.value.editTitle = '';
  }

  function updateEditTitle(value) {
    state.value.editTitle = value;
  }

  function updateTabTitleBySearch(id, value) {
    const tab = state.value.tabs.find((item) => item.id === id);
    if (tab && state.value.editingTabId !== id) tab.title = value || tab.title;
    if (state.value.searchStates[id]) state.value.searchStates[id].searchValue = value;
  }

  function resetTabs() {
    state.value = {
      tabs: [],
      activeTabId: null,
      editingTabId: null,
      editTitle: '',
      searchStates: {},
    };
    addTab();
  }

  return {
    state,
    addTab,
    closeTab,
    setActive,
    getSearchState,
    startEdit,
    finishEdit,
    updateEditTitle,
    updateTabTitleBySearch,
    resetTabs,
  };
});
