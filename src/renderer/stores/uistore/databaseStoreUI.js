import { defineStore } from 'pinia';
import { reactive, computed } from 'vue';
import { useSearchStore } from '../searchStore.js';
import { ALL_SOURCE_TYPES, SORT_ASCENDING, SORT_DESCENDING, CATALOG_PAGE_SIZE, getCatalogTypes, selectCatalogRows, sumCatalogCounts } from '../../utils/catalog.js';

export const useDatabaseStore = defineStore('database', () => {
  const searchStore = useSearchStore();
  const state = reactive({ rows: [], selectedType: ALL_SOURCE_TYPES, sortKey: null, sortDirection: SORT_ASCENDING, page: 1, loading: false, error: null });
  const types = computed(() => getCatalogTypes(state.rows));
  const filteredRows = computed(() => selectCatalogRows(state.rows, state));
  const filteredCountSum = computed(() => sumCatalogCounts(filteredRows.value));
  const filteredRowCount = computed(() => filteredRows.value.length);
  const pageCount = computed(() => Math.max(1, Math.ceil(filteredRowCount.value / CATALOG_PAGE_SIZE)));
  const pagedRows = computed(() => filteredRows.value.slice((state.page - 1) * CATALOG_PAGE_SIZE, state.page * CATALOG_PAGE_SIZE));
  async function fetchAll() {
    state.loading = true;
    state.error = null;
    try {
      state.rows = await searchStore.listDatabases({ request: 'catalog' });
      setPage(state.page);
    }
    catch (error) { state.error = error.message ?? error.toString(); }
    finally { state.loading = false; }
  }
  function setSort(key) {
    state.sortDirection = state.sortKey === key && state.sortDirection === SORT_ASCENDING ? SORT_DESCENDING : SORT_ASCENDING;
    state.sortKey = key;
    state.page = 1;
  }
  const setFilter = (type) => { state.selectedType = type; state.page = 1; };
  function setPage(page) {
    state.page = Math.min(pageCount.value, Math.max(1, Number.isSafeInteger(page) ? page : 1));
  }
  function reset() {
    Object.assign(state, { rows: [], selectedType: ALL_SOURCE_TYPES, sortKey: null, sortDirection: SORT_ASCENDING, page: 1, error: null });
  }
  return { state, types, filteredRows, filteredCountSum, filteredRowCount, pagedRows, pageCount, fetchAll, setSort, setFilter, setPage, reset };
});
