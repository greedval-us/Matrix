import { defineStore } from 'pinia';
import { reactive, computed } from 'vue';
import { useSearchStore } from '../searchStore.js';
import { ALL_SOURCE_TYPES, SORT_ASCENDING, SORT_DESCENDING, getCatalogTypes, selectCatalogRows, sumCatalogCounts } from '../../utils/catalog.js';

export const useDatabaseStore = defineStore('database', () => {
  const searchStore = useSearchStore();
  const state = reactive({ rows: [], selectedType: ALL_SOURCE_TYPES, sortKey: null, sortDirection: SORT_ASCENDING, loading: false, error: null });
  const types = computed(() => getCatalogTypes(state.rows));
  const filteredRows = computed(() => selectCatalogRows(state.rows, state));
  const filteredCountSum = computed(() => sumCatalogCounts(filteredRows.value));
  const filteredRowCount = computed(() => filteredRows.value.length);
  async function fetchAll() {
    state.loading = true;
    state.error = null;
    try { state.rows = await searchStore.listDatabases({ request: 'catalog' }); }
    catch (error) { state.error = error.message ?? error.toString(); }
    finally { state.loading = false; }
  }
  function setSort(key) {
    state.sortDirection = state.sortKey === key && state.sortDirection === SORT_ASCENDING ? SORT_DESCENDING : SORT_ASCENDING;
    state.sortKey = key;
  }
  const setFilter = (type) => { state.selectedType = type; };
  function reset() {
    Object.assign(state, { rows: [], selectedType: ALL_SOURCE_TYPES, sortKey: null, sortDirection: SORT_ASCENDING, error: null });
  }
  return { state, types, filteredRows, filteredCountSum, filteredRowCount, fetchAll, setSort, setFilter, reset };
});
