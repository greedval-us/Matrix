import { recordsErrorMessage } from './recordsOperationContext.js';

export function createRecordAttachmentActions({ state, service, operations, load }) {
  const { isActive, isRowPending, begin, finish } = operations;
  function updateFiles(rowId, update) {
    state.rows = state.rows.map(row => row.id === rowId ? { ...row, files: update(row.files) } : row);
  }

  async function upload(row) {
    if (!begin(row.id, 'upload')) return;
    state.error = '';
    try {
      const result = await service.uploadFiles({ rowId: row.id });
      if (!isActive() || result.cancelled) return;
      updateFiles(row.id, files => [...new Map([...files, ...result.files].map(file => [file.id, file])).values()]);
      state.notice = 'Файлы добавлены.';
      await load();
    } catch (error) { if (isActive()) state.error = recordsErrorMessage(error); }
    finally { finish(row.id); }
  }
  async function download({ row, file }) {
    if (!begin(row.id, 'download', file.id)) return;
    state.error = '';
    try {
      const result = await service.downloadFile({ rowId: row.id, fileId: file.id });
      if (isActive() && !result.cancelled) state.notice = 'Файл сохранён.';
    } catch (error) { if (isActive()) state.error = recordsErrorMessage(error); }
    finally { finish(row.id, file.id); }
  }
  function requestRemove(target) {
    if (isActive() && !state.editor && !state.rowDeleteTarget && !state.deleteBusy && state.capabilities.remove && !isRowPending(target.row.id)) { state.deleteTarget = target; state.deleteError = ''; }
  }
  function closeRemove() { if (!state.deleteBusy) { state.deleteTarget = null; state.deleteError = ''; } }
  async function confirmRemove() {
    const target = state.deleteTarget;
    if (!target || !begin(target.row.id, 'remove', target.file.id)) return;
    state.deleteBusy = true;
    state.deleteError = '';
    try {
      await service.removeFile({ rowId: target.row.id, fileId: target.file.id });
      if (!isActive()) return;
      updateFiles(target.row.id, files => files.filter(file => file.id !== target.file.id));
      state.notice = 'Файл удалён.';
      state.deleteTarget = null;
      await load();
    } catch (error) { if (isActive()) state.deleteError = recordsErrorMessage(error); }
    finally { if (isActive()) state.deleteBusy = false; finish(target.row.id, target.file.id); }
  }

  return { upload, download, requestRemove, closeRemove, confirmRemove };
}
