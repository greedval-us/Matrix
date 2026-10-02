import { defineStore } from 'pinia';
import { reactive, shallowRef } from 'vue';
import { Field } from '../../utils/Field.js';
import {
  iconsSerchs,
  defaultPatterns,
  defaultPlaceholders,
} from '../../../shared/constants/searchItems.js';
import { key as translateKey } from '../../../shared/constants/translateKey.js';
import { help } from '../../../shared/constants/help.js';
import { useSearchStore } from '../searchStore.js';
import { useTabStore } from '../tabStore.js';
import { createRecordFingerprint, ResultParser } from '../../utils/ResultParser.js';
import { useHistoryStore } from '../historyStore.js';

export const useSearchUIStore = defineStore('searchUI', () => {
  const tabStore = useTabStore();
  const historyStore = useHistoryStore();
  const parser = new ResultParser();
  const icons = shallowRef(iconsSerchs);
  const recordKeysByTab = new Map();
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
    return Object.fromEntries(iconsSerchs.map(({ type }) => [type, fields[type]?.value ?? '']));
  }
  function setFieldValue(id, type, value) {
    getTab(id)?.selectedFields[type]?.setValue(value);
  }
  function toggleField(id, type) {
    const tab = getTab(id);
    if (!tab || !iconsSerchs.some((item) => item.type === type)) return;
    if (type in tab.selectedFields) {
      delete tab.selectedFields[type];
      delete tab.collapsedFields[type];
    } else {
      const field = reactive(new Field(type, '', getPattern(type)));
      field.placeholder = getPlaceholder(type);
      tab.selectedFields[type] = field;
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
    if (!recordKeysByTab.has(id)) recordKeysByTab.set(id, new Set());
    const recordKeys = recordKeysByTab.get(id);
    const normalized = [];
    for (const rawItem of data) {
      const item = parser.parse(rawItem);
      if (item.type === 'object_data') {
        const fingerprint = JSON.stringify([item.source, createRecordFingerprint(item.fields)]);
        if (recordKeys.has(fingerprint)) continue;
        recordKeys.add(fingerprint);
      }
      normalized.push(item);
    }
    tab.results.push(...normalized);
  }
  function clearResults(id) {
    recordKeysByTab.delete(id);
    delete activeBases[id];
    const tab = getTab(id);
    if (tab)
      Object.assign(tab, { results: [], error: '', meta: null, received: 0, hasSearched: false });
  }
  function resetAllFields(id) {
    const tab = getTab(id);
    if (tab) Object.assign(tab, { selectedFields: {}, collapsedFields: {} });
  }
  function clearTab(id) {
    delete activeBases[id];
    recordKeysByTab.delete(id);
  }

  async function search(id) {
    if (!getTab(id) || pendingSearches.has(id)) return;
    const query = getFullQuery(id);
    if (!Object.values(query).some((value) => String(value).trim())) return;
    const operation = { cancelled: false };
    pendingSearches.set(id, operation);
    const searchStore = useSearchStore();
    clearResults(id);
    updateState(id, 'hasSearched', true);
    setLoading(id, true);
    tabStore.updateTabTitleBySearch(id, Object.values(query).filter(Boolean).join(', '));

    try {
      await searchStore.createClient(id);
      if (operation.cancelled || !getTab(id)) {
        setMeta(id, { cancelled: true });
        return;
      }
      const response = await searchStore.search(id, query, {
        onChunk(items, received) {
          if (!getTab(id)) return;
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
    } catch (error) {
      if (operation.cancelled) setMeta(id, { cancelled: true });
      else setError(id, error?.message || String(error));
    } finally {
      try {
        await searchStore.destroyClient(id);
      } catch (error) {
        if (!getError(id)) setError(id, error?.message || 'Не удалось закрыть подключение');
      } finally {
        pendingSearches.delete(id);
        setLoading(id, false);
      }
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
