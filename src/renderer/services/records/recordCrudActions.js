import { CONTROL_RECORD_FIELDS, normalizeControlValues } from '../../../shared/constants/controlRecord.js';
import { getLastRecordsPage } from './recordsListWorkflow.js';
import { recordsErrorMessage } from './recordsOperationContext.js';

const ATTACHED_RECORD_DELETE_MESSAGE = 'Сначала удалите прикреплённые файлы, затем удалите запись.';

export function createRecordCrudActions({ state, service, operations, load, invalidateList, now }) {
  const { isActive, isAvailable, isRowPending, begin, finish } = operations;
  let createPending = false;
  function canOpenDialog() {
    return isActive() && isAvailable() && !state.editorBusy && !state.rowDeleteTarget && !state.deleteTarget;
  }
  function requestCreate() {
    if (!canOpenDialog() || !state.capabilities.create || createPending) return;
    const today = now();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    state.editor = { mode: 'create', rowId: null, values: Object.fromEntries(CONTROL_RECORD_FIELDS.map(field => [field.key, field.key === 'date' ? date : ''])) };
    state.editorError = '';
  }
  function requestEdit(row) {
    if (!canOpenDialog() || !state.capabilities.update || isRowPending(row.id)) return;
    state.editor = { mode: 'edit', rowId: row.id,
      values: Object.fromEntries(CONTROL_RECORD_FIELDS.map(field => [field.key, String(row.values[field.key] ?? '')])) };
    state.editorError = '';
  }
  function setEditorValue(key, value) {
    if (!isActive() || !state.editor || state.editorBusy || !CONTROL_RECORD_FIELDS.some(field => field.key === key)) return;
    state.editor.values[key] = value;
  }
  function closeEditor() {
    if (isActive() && !state.editorBusy) { state.editor = null; state.editorError = ''; }
  }
  async function saveRecord() {
    const editor = state.editor;
    if (!isActive() || !editor || state.editorBusy) return;
    const create = editor.mode === 'create';
    if (!state.capabilities[create ? 'create' : 'update']) return;
    let values;
    try { values = normalizeControlValues(editor.values, { create }); }
    catch (error) { state.editorError = recordsErrorMessage(error); return; }
    if (create ? createPending : !begin(editor.rowId, 'update')) return;
    if (create) createPending = true;
    state.editorBusy = true;
    state.editorError = '';
    state.notice = '';
    try {
      const row = create ? await service.createRecord({ values }) : await service.updateRecord({ rowId: editor.rowId, values });
      if (!isActive() || state.editor !== editor) return;
      invalidateList();
      if (create) { state.rows = [row, ...state.rows].slice(0, state.pageSize); state.total++; }
      else state.rows = state.rows.map(existing => existing.id === row.id ? row : existing);
      state.notice = create ? 'Запись создана.' : 'Запись сохранена.';
      state.editor = null;
      state.editorBusy = false;
      await load();
    } catch (error) { if (isActive() && state.editor === editor) state.editorError = recordsErrorMessage(error); }
    finally {
      if (create) createPending = false;
      else finish(editor.rowId);
      if (isActive() && state.editor === editor) state.editorBusy = false;
    }
  }
  function requestDelete(row) {
    if (!canOpenDialog() || state.editor || !state.capabilities.delete || isRowPending(row.id)) return;
    state.rowDeleteTarget = row;
    state.rowDeleteError = row.files.length ? ATTACHED_RECORD_DELETE_MESSAGE : '';
  }
  function closeDelete() {
    if (isActive() && !state.rowDeleteBusy) { state.rowDeleteTarget = null; state.rowDeleteError = ''; }
  }
  async function confirmDelete() {
    const target = state.rowDeleteTarget;
    if (!isActive() || !target || state.rowDeleteBusy) return;
    const current = state.rows.find(row => row.id === target.id) ?? target;
    if (current.files.length || target.files.length) { state.rowDeleteError = ATTACHED_RECORD_DELETE_MESSAGE; return; }
    if (!begin(target.id, 'delete')) return;
    state.rowDeleteBusy = true;
    state.rowDeleteError = '';
    try {
      await service.deleteRecord({ rowId: target.id });
      if (!isActive() || state.rowDeleteTarget !== target) return;
      invalidateList();
      state.rows = state.rows.filter(row => row.id !== target.id);
      state.total = Math.max(0, state.total - 1);
      state.page = Math.min(state.page, getLastRecordsPage(state.total, state.pageSize));
      state.notice = 'Запись удалена.';
      state.rowDeleteTarget = null;
      state.rowDeleteBusy = false;
      await load();
    } catch (error) { if (isActive() && state.rowDeleteTarget === target) state.rowDeleteError = recordsErrorMessage(error); }
    finally { if (isActive() && state.rowDeleteTarget === target) state.rowDeleteBusy = false; finish(target.id); }
  }

  return { requestCreate, requestEdit, setEditorValue, closeEditor, saveRecord, requestDelete, closeDelete, confirmDelete };
}
