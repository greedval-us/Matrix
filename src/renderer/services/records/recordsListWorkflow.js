import { RECORDS_PAGE_SIZES, RECORDS_SEARCH_DELAY_MS, RECORDS_QUERY_MAX_LENGTH } from '../../../shared/constants/records.js';
import { recordsErrorMessage } from './recordsOperationContext.js';

export const getLastRecordsPage = (total, pageSize) => Math.max(1, Math.ceil(total / pageSize));

export function createRecordsListWorkflow({ state, service, isActive, isAvailable, setTimer, clearTimer }) {
  let requestVersion = 0;
  let connectionVersion = 0;
  let searchTimer;
  function invalidate() { ++requestVersion; }
  function clearSearchTimer() { clearTimer(searchTimer); searchTimer = undefined; }

  async function load() {
    clearSearchTimer();
    if (!isActive() || !isAvailable()) return false;
    const version = ++requestVersion;
    const request = { query: state.query.trim(), sort: state.sort ? { ...state.sort } : null, page: state.page, pageSize: state.pageSize };
    state.loading = true;
    state.error = '';
    try {
      const result = await service.list(request);
      if (!isActive() || version !== requestVersion) return false;
      const lastPage = getLastRecordsPage(result.total, state.pageSize);
      if (state.page > lastPage) { state.page = lastPage; return await load(); }
      Object.assign(state, result);
      // A changed schema must not leave an invisible sort applied to subsequent requests.
      if (state.sort && !result.columns.some(column => column.key === state.sort.key && column.sortable)) {
        state.sort = null;
        return await load();
      }
      return true;
    } catch (error) {
      if (isActive() && version === requestVersion) state.error = recordsErrorMessage(error);
      return false;
    } finally {
      if (isActive() && version === requestVersion) state.loading = false;
    }
  }

  async function initialize() {
    const version = ++connectionVersion;
    state.connecting = true;
    state.error = '';
    try {
      const capabilities = await service.getCapabilities();
      if (!isActive() || version !== connectionVersion) return;
      state.capabilities = capabilities;
      if (isAvailable()) await load();
      else { invalidate(); Object.assign(state, { rows: [], columns: [], total: 0, loading: false }); }
    } catch (error) {
      if (isActive() && version === connectionVersion) state.error = recordsErrorMessage(error);
    } finally {
      if (isActive() && version === connectionVersion) state.connecting = false;
    }
  }

  function setQuery(value) {
    state.query = String(value).slice(0, RECORDS_QUERY_MAX_LENGTH);
    state.page = 1;
    invalidate();
    clearSearchTimer();
    if (isActive() && isAvailable()) { state.loading = true; searchTimer = setTimer(load, RECORDS_SEARCH_DELAY_MS); }
  }
  function setSort(key) {
    if (!state.columns.some(column => column.key === key && column.sortable)) return;
    state.sort = { key, direction: state.sort?.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc' };
    state.page = 1;
    return load();
  }
  function setPage(page) {
    if (!Number.isSafeInteger(page)) return;
    state.page = Math.max(1, Math.min(page, getLastRecordsPage(state.total, state.pageSize)));
    return load();
  }
  function setPageSize(size) {
    if (!RECORDS_PAGE_SIZES.includes(size)) return;
    state.pageSize = size;
    state.page = 1;
    return load();
  }
  const refresh = () => isAvailable() ? load() : initialize();

  function dispose() {
    invalidate();
    ++connectionVersion;
    clearSearchTimer();
  }
  return { initialize, refresh, setQuery, setSort, setPage, setPageSize, load, invalidate, dispose };
}
