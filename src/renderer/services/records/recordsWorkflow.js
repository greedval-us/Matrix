import { DEFAULT_RECORDS_PAGE_SIZE, RECORDS_PAGE_SIZES, RECORDS_SEARCH_DELAY_MS, RECORDS_QUERY_MAX_LENGTH,
  UNAVAILABLE_RECORDS_CAPABILITIES } from '../../../shared/constants/records.js';
import { attachmentOperationKey } from '../../utils/records.js';

export function createRecordsState() {
  return { capabilities: { ...UNAVAILABLE_RECORDS_CAPABILITIES }, columns: [], rows: [], total: 0,
    query: '', sort: null, page: 1, pageSize: DEFAULT_RECORDS_PAGE_SIZE,
    loading: false, connecting: false, error: '', notice: '', pendingRows: [], pendingFiles: [],
    deleteTarget: null, deleteBusy: false, deleteError: '' };
}

export function createRecordsWorkflow({ state, service, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let active = true;
  let requestVersion = 0;
  let connectionVersion = 0;
  let searchTimer;
  const pendingRows = new Set();
  const pendingFiles = new Set();
  const available = () => state.capabilities.available && state.capabilities.list;
  const message = error => error?.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';
  function clearSearchTimer() { clearTimer(searchTimer); searchTimer = undefined; }

  async function load() {
    clearSearchTimer();
    if (!active || !available()) return false;
    const version = ++requestVersion;
    const request = { query: state.query.trim(), sort: state.sort ? { ...state.sort } : null, page: state.page, pageSize: state.pageSize };
    state.loading = true;
    state.error = '';
    try {
      const result = await service.list(request);
      if (!active || version !== requestVersion) return false;
      const lastPage = Math.max(1, Math.ceil(result.total / state.pageSize));
      if (state.page > lastPage) { state.page = lastPage; return await load(); }
      Object.assign(state, result);
      // A changed schema must not leave an invisible sort applied to subsequent requests.
      if (state.sort && !result.columns.some(column => column.key === state.sort.key && column.sortable)) {
        state.sort = null;
        return await load();
      }
      return true;
    } catch (error) {
      if (active && version === requestVersion) state.error = message(error);
      return false;
    } finally {
      if (active && version === requestVersion) state.loading = false;
    }
  }

  async function initialize() {
    const version = ++connectionVersion;
    state.connecting = true;
    state.error = '';
    try {
      const capabilities = await service.getCapabilities();
      if (!active || version !== connectionVersion) return;
      state.capabilities = capabilities;
      if (available()) await load();
      else { ++requestVersion; Object.assign(state, { rows: [], columns: [], total: 0, loading: false }); }
    } catch (error) {
      if (active && version === connectionVersion) state.error = message(error);
    } finally {
      if (active && version === connectionVersion) state.connecting = false;
    }
  }

  function setQuery(value) {
    state.query = String(value).slice(0, RECORDS_QUERY_MAX_LENGTH);
    state.page = 1;
    ++requestVersion;
    clearSearchTimer();
    if (active && available()) { state.loading = true; searchTimer = setTimer(load, RECORDS_SEARCH_DELAY_MS); }
  }
  function setSort(key) {
    if (!state.columns.some(column => column.key === key && column.sortable)) return;
    state.sort = { key, direction: state.sort?.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc' };
    state.page = 1;
    return load();
  }
  function setPage(page) {
    if (!Number.isSafeInteger(page)) return;
    state.page = Math.max(1, Math.min(page, Math.max(1, Math.ceil(state.total / state.pageSize))));
    return load();
  }
  function setPageSize(size) {
    if (!RECORDS_PAGE_SIZES.includes(size)) return;
    state.pageSize = size;
    state.page = 1;
    return load();
  }
  const refresh = () => available() ? load() : initialize();

  function syncPending() { state.pendingRows = [...pendingRows]; state.pendingFiles = [...pendingFiles]; }
  function begin(rowId, capability, fileId) {
    if (!active || !state.capabilities[capability] || pendingRows.has(rowId)) return false;
    pendingRows.add(rowId);
    if (fileId !== undefined) pendingFiles.add(attachmentOperationKey(rowId, fileId));
    syncPending();
    state.notice = '';
    return true;
  }
  function finish(rowId, fileId) {
    pendingRows.delete(rowId);
    pendingFiles.delete(attachmentOperationKey(rowId, fileId));
    if (active) syncPending();
  }
  function updateFiles(rowId, update) {
    state.rows = state.rows.map(row => row.id === rowId ? { ...row, files: update(row.files) } : row);
  }

  async function upload(row) {
    if (!begin(row.id, 'upload')) return;
    state.error = '';
    try {
      const result = await service.uploadFiles({ rowId: row.id });
      if (!active || result.cancelled) return;
      updateFiles(row.id, files => [...new Map([...files, ...result.files].map(file => [file.id, file])).values()]);
      state.notice = 'Файлы добавлены.';
      await load();
    } catch (error) { if (active) state.error = message(error); }
    finally { finish(row.id); }
  }
  async function download({ row, file }) {
    if (!begin(row.id, 'download', file.id)) return;
    state.error = '';
    try {
      const result = await service.downloadFile({ rowId: row.id, fileId: file.id });
      if (active && !result.cancelled) state.notice = 'Файл сохранён.';
    } catch (error) { if (active) state.error = message(error); }
    finally { finish(row.id, file.id); }
  }
  function requestRemove(target) {
    if (state.capabilities.remove && !pendingRows.has(target.row.id)) { state.deleteTarget = target; state.deleteError = ''; }
  }
  function closeRemove() { if (!state.deleteBusy) { state.deleteTarget = null; state.deleteError = ''; } }
  async function confirmRemove() {
    const target = state.deleteTarget;
    if (!target || !begin(target.row.id, 'remove', target.file.id)) return;
    state.deleteBusy = true;
    state.deleteError = '';
    try {
      await service.removeFile({ rowId: target.row.id, fileId: target.file.id });
      if (!active) return;
      updateFiles(target.row.id, files => files.filter(file => file.id !== target.file.id));
      state.notice = 'Файл удалён.';
      state.deleteTarget = null;
      await load();
    } catch (error) { if (active) state.deleteError = message(error); }
    finally { if (active) state.deleteBusy = false; finish(target.row.id, target.file.id); }
  }

  function dispose() {
    active = false;
    ++requestVersion;
    ++connectionVersion;
    clearSearchTimer();
  }
  return { initialize, refresh, setQuery, setSort, setPage, setPageSize, upload, download, requestRemove, closeRemove, confirmRemove, dispose };
}
