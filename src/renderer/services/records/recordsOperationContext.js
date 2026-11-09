import { attachmentOperationKey } from '../../utils/records.js';

export const recordsErrorMessage = error => error?.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';

// Attachments and record mutations share one lock per row and one page lifetime.
export function createRecordsOperationContext(state) {
  let active = true;
  const pendingRows = new Set();
  const pendingFiles = new Set();
  const isActive = () => active;
  const isAvailable = () => state.capabilities.available && state.capabilities.list;
  const isRowPending = rowId => pendingRows.has(rowId);
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
  function dispose() { active = false; }
  return { isActive, isAvailable, isRowPending, begin, finish, dispose };
}
