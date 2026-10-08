import { defineStore } from 'pinia';
import { reactive, shallowRef } from 'vue';
import { defaultPatterns, defaultPlaceholders } from '../../../shared/constants/searchItems.js';
import { iconsSerchs } from '../../constants/searchFields.js';
import { buildSearchQuery, createSearchField, hasSearchValues, getQueryTitle } from '../../utils/searchQuery.js';
import { createSearchResultState } from '../../utils/searchState.js';
import { createResultAccumulator } from '../../services/search/resultAccumulator.js';
import { withSearchClient } from '../../services/search/searchSession.js';
import { key as translateKey } from '../../../shared/constants/translateKey.js';
import { help } from '../../../shared/constants/help.js';
import { useSearchStore } from '../searchStore.js';
import { useTabStore } from '../tabStore.js';
import { useHistoryStore } from '../historyStore.js';

export const useSearchUIStore = defineStore('searchUI', () => {
  const tabStore = useTabStore();
  const historyStore = useHistoryStore();
  const icons = shallowRef(iconsSerchs);
  const resultsByTab = new Map();
  const pendingSearches = new Map();
  const activeBases = reactive({});

  const getTab = (id) => tabStore.getSearchState(id);
  const getSelectedFields = (id) => getTab(id)?.selectedFields || {};
  const getResults = (id) => getTab(id)?.results || [];
  const getLoading = (id) => getTab(id)?.loading || false;
  const getError = (id) => getTab(id)?.error || '';
  const getMeta = (id) => getTab(id)?.meta || null;
  const getReceived = (id) => getTab(id)?.received || 0;
  const getFieldValue = (id, type) => getTab(id)?.selectedFields[type]?.value || '';
  const getFieldLabel = (type) => translateKey[type] || type;
  const getPlaceholder = (type) => defaultPlaceholders[type] || '';
  const getPattern = (type) => defaultPatterns[type] || '.*';
  const getHelp = (type) => (help[type] || '') + (help.wildcards || '');

  function updateState(id, key, value) {
    const tab = getTab(id);
    if (tab) tab[key] = value;
  }
  const setLoading = (id, value) => updateState(id, 'loading', value);
  const setError = (id, value) => updateState(id, 'error', value || '');
  const setMeta = (id, value) => updateState(id, 'meta', value || null);
  const setReceived = (id, value) => updateState(id, 'received', Number(value) || 0);

  function getFullQuery(id) {
    const fields = getSelectedFields(id);
    return buildSearchQuery(fields);
  }
  function setFieldValue(id, type, value) {
    getTab(id)?.selectedFields[type]?.setValue(value);
  }
  function toggleField(id, type) {
    const tab = getTab(id);
    const newField = createSearchField(type);
    if (!tab || !newField) return;
    if (type in tab.selectedFields) {
      delete tab.selectedFields[type];
      delete tab.collapsedFields[type];
    } else {
      tab.selectedFields[type] = reactive(newField);
      tab.collapsedFields[type] = false;
    }
  }
  function toggleCollapse(id, type) {
    const tab = getTab(id);
    if (tab) tab.collapsedFields[type] = !tab.collapsedFields[type];
  }
  function appendResults(id, data) {
    const tab = getTab(id);
    if (!tab || !Array.isArray(data)) return;
    if (!resultsByTab.has(id)) resultsByTab.set(id, createResultAccumulator());
    tab.results.push(...resultsByTab.get(id).append(data));
  }
  function clearResults(id) {
    resultsByTab.delete(id);
    delete activeBases[id];
    const tab = getTab(id);
    if (tab) Object.assign(tab, createSearchResultState());
  }
  function resetAllFields(id) {
    const tab = getTab(id);
    if (tab) Object.assign(tab, { selectedFields: {}, collapsedFields: {} });
  }
  function clearTab(id) {
    delete activeBases[id];
    resultsByTab.delete(id);
  }

  async function search(id) {
    if (!getTab(id) || pendingSearches.has(id)) return;
    const query = getFullQuery(id);
    if (!hasSearchValues(query)) return;
    const operation = { cancelled: false };
    pendingSearches.set(id, operation);
    const searchStore = useSearchStore();
    clearResults(id);
    updateState(id, 'hasSearched', true);
    setLoading(id, true);
    tabStore.updateTabTitleBySearch(id, getQueryTitle(query));

    try {
      await withSearchClient(searchStore, id, async () => {
        if (operation.cancelled || !getTab(id)) {
          setMeta(id, { cancelled: true });
          return;
        }
        const response = await searchStore.search(id, query, {
          onChunk(items, received) {
            if (operation.cancelled || !getTab(id)) return;
            appendResults(id, items);
            setReceived(id, received);
          },
        });
        setMeta(id, response?.meta);
        await Promise.allSettled(
          Object.entries(query)
            .filter(([, value]) => value)
            .map(([key, value]) => historyStore.addHistoryItem(key, value)),
        );
      }, {
        onCleanupError(error) {
          if (!getError(id)) setError(id, error?.message || 'Не удалось закрыть подключение');
        },
      });
    } catch (error) {
      if (operation.cancelled) setMeta(id, { cancelled: true });
      else setError(id, error?.message || String(error));
    } finally {
      pendingSearches.delete(id);
      setLoading(id, false);
    }
  }
  function cancelSearch(id) {
    const operation = pendingSearches.get(id);
    if (!operation) return;
    operation.cancelled = true;
    useSearchStore().cancelSearch(id);
  }
  function quickSearch(id, updates) {
    resetAllFields(id);
    for (const { key, value } of Object.values(updates)) {
      toggleField(id, key);
      setFieldValue(id, key, value);
    }
    return search(id);
  }
  function setActiveBase(name, id = tabStore.state.activeTabId) {
    if (getTab(id)) activeBases[id] = name;
  }
  const getActiveBase = (id = tabStore.state.activeTabId) => activeBases[id] || null;

  return {
    icons,
    activeBases,
    setActiveBase,
    getActiveBase,
    getSelectedFields,
    getResults,
    getLoading,
    getError,
    getMeta,
    getReceived,
    getFieldValue,
    getFieldLabel,
    getPlaceholder,
    getPattern,
    getHelp,
    getFullQuery,
    setFieldValue,
    toggleField,
    toggleCollapse,
    appendResults,
    setLoading,
    setError,
    setMeta,
    setReceived,
    clearTab,
    search,
    cancelSearch,
    quickSearch,
    clearResults,
    resetAllFields,
  };
});
