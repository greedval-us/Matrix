import { DEFAULT_RECORDS_PAGE_SIZE, UNAVAILABLE_RECORDS_CAPABILITIES } from '../../../shared/constants/records.js';
import { createRecordsOperationContext } from './recordsOperationContext.js';
import { createRecordsListWorkflow } from './recordsListWorkflow.js';
import { createRecordAttachmentActions } from './recordAttachmentActions.js';
import { createRecordCrudActions } from './recordCrudActions.js';

export function createRecordsState() {
  return { capabilities: { ...UNAVAILABLE_RECORDS_CAPABILITIES }, columns: [], rows: [], total: 0,
    query: '', sort: null, page: 1, pageSize: DEFAULT_RECORDS_PAGE_SIZE,
    loading: false, connecting: false, error: '', notice: '', pendingRows: [], pendingFiles: [],
    deleteTarget: null, deleteBusy: false, deleteError: '',
    editor: null, editorBusy: false, editorError: '', rowDeleteTarget: null, rowDeleteBusy: false, rowDeleteError: '' };
}

export function createRecordsWorkflow({ state, service, setTimer = setTimeout, clearTimer = clearTimeout, now = () => new Date() }) {
  const operations = createRecordsOperationContext(state);
  const list = createRecordsListWorkflow({ state, service,
    isActive: operations.isActive, isAvailable: operations.isAvailable, setTimer, clearTimer });
  const attachments = createRecordAttachmentActions({ state, service, operations, load: list.load });
  const records = createRecordCrudActions({ state, service, operations, load: list.load, invalidateList: list.invalidate, now });

  function dispose() {
    operations.dispose();
    list.dispose();
  }

  return {
    initialize: list.initialize, refresh: list.refresh, setQuery: list.setQuery,
    setSort: list.setSort, setPage: list.setPage, setPageSize: list.setPageSize,
    ...attachments, ...records, dispose,
  };
}
