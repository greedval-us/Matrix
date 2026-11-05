import { computed, readonly, ref, shallowRef, toValue, watch } from 'vue';
import { useTabStore } from '../stores/tabStore.js';
import { useSearchUIStore } from '../stores/uistore/serchStoreUI.js';
import { useNotesStore } from '../stores/notesStore.js';
import { SEARCH_FIELD_IDS } from '../../shared/constants/searchItems.js';
import { RESULT_PAGE_SIZE } from '../constants/resultPresentation.js';
import { groupSearchResults, getSearchSuggestions, buildResultNote } from '../utils/searchResults.js';

export function useSearchResults({ tabId, searchUI = useSearchUIStore(),
  tabStore = useTabStore(), notesStore = useNotesStore(), clipboard = globalThis.navigator?.clipboard }) {
  const searchableTypes = new Set(SEARCH_FIELD_IDS);
  const results = computed(() => searchUI.getResults(toValue(tabId)));
  const loading = computed(() => searchUI.getLoading(toValue(tabId)));
  const error = computed(() => searchUI.getError(toValue(tabId)));
  const meta = computed(() => searchUI.getMeta(toValue(tabId)));
  const received = computed(() => searchUI.getReceived(toValue(tabId)));
  const hasSearched = computed(() => tabStore.getSearchState(toValue(tabId))?.hasSearched);
  const activeBase = computed(() => searchUI.getActiveBase(toValue(tabId)));
  const bases = computed(() => groupSearchResults(results.value));
  const recordCount = computed(() => bases.value.reduce((count, base) => count + base.data.length, 0));
  const suggestions = computed(() => getSearchSuggestions(
    results.value, searchUI.getSelectedFields(toValue(tabId)), searchableTypes,
  ));
  const visibleCounts = ref({});
  const notice = shallowRef('');
  const copied = shallowRef('');
  const savedSources = ref(new Set());
  const savingSources = ref(new Set());

  watch(results, () => {
    visibleCounts.value = {};
    savedSources.value = new Set();
    notice.value = '';
  });

  function showMore(source) {
    visibleCounts.value[source] = (visibleCounts.value[source] || RESULT_PAGE_SIZE) + RESULT_PAGE_SIZE;
  }

  function searchRelated(preload) {
    return searchUI.quickSearch(tabStore.addTab(), preload);
  }

  async function copyValue(value) {
    notice.value = '';
    try {
      await clipboard.writeText(String(value));
      copied.value = String(value);
    } catch {
      notice.value = 'Не удалось скопировать. Выделите значение и скопируйте вручную.';
    }
  }

  async function saveNote(base) {
    if (savingSources.value.has(base.source)) return;
    const snapshot = results.value;
    savingSources.value.add(base.source);
    notice.value = '';
    try {
      await notesStore.addNote(buildResultNote(base, searchUI.getFieldLabel));
      if (snapshot === results.value) savedSources.value.add(base.source);
    } catch (reason) {
      if (snapshot === results.value) notice.value = reason?.message || 'Не удалось сохранить заметку';
    } finally {
      savingSources.value.delete(base.source);
    }
  }

  return { loading, error, meta, received, hasSearched, activeBase, bases, recordCount, suggestions,
    visibleCounts: readonly(visibleCounts), notice: readonly(notice), copied: readonly(copied),
    savedSources: readonly(savedSources), savingSources: readonly(savingSources),
    fieldLabel: searchUI.getFieldLabel, showMore, searchRelated, copyValue, saveNote,
    retry: () => searchUI.search(toValue(tabId)) };
}
