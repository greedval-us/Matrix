import assert from 'node:assert/strict';
import test from 'node:test';
import { createRecordsState, createRecordsWorkflow } from '../../../src/renderer/services/records/recordsWorkflow.js';
import { RecordsService } from '../../../src/renderer/services/RecordsService.js';

const row = { id: '90071992547409931', values: { date: '2026-11-05', fio: 'Иванов', initiator: 'Инициатор', note: 'Заметка' }, files: [] };
const page = (rows = [row], total = rows.length) => ({ rows, total, columns: [{ key: 'fio', sortable: true }] });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(overrides = {}) {
  const state = createRecordsState();
  const service = { getCapabilities: async () => ({ available: true, list: true, create: true, update: true, delete: true, upload: true, remove: true }), list: async () => page(), ...overrides };
  return { state, service, actions: createRecordsWorkflow({ state, service, now: () => new Date(2026, 0, 2, 0, 1) }) };
}

test('new record defaults to local calendar today and validation keeps entered values', async () => {
  let calls = 0;
  const { state, actions } = setup({ createRecord: async () => { calls++; } });
  await actions.initialize(); actions.requestCreate();
  assert.equal(state.editor.values.date, '2026-01-02');
  assert.equal(state.editor.values.initiator, '');
  actions.setEditorValue('initiator', 'Новый инициатор');
  actions.setEditorValue('date', '2025-02-29');
  actions.setEditorValue('date_of_birth', '1986 г.');
  await actions.saveRecord();
  assert.equal(calls, 0); assert.match(state.editorError, /дат/);
  assert.equal(state.editor.values.date, '2025-02-29');
  assert.equal(state.editor.values.date_of_birth, '1986 г.');
  assert.equal(state.editor.values.initiator, 'Новый инициатор');
  actions.closeEditor(); assert.equal(state.editor, null);
});

test('failed save preserves values; busy save cannot duplicate, close or overlap attachment operation', async () => {
  const reply = deferred(); let calls = 0; let uploads = 0;
  const { state, actions } = setup({ updateRecord: async () => { calls++; return reply.promise; }, uploadFiles: async () => { uploads++; } });
  await actions.initialize(); actions.requestEdit(row); actions.setEditorValue('fio', 'Изменено');
  const save = actions.saveRecord(); actions.closeEditor(); await actions.saveRecord(); await actions.upload(row);
  assert.equal(calls, 1); assert.equal(uploads, 0); assert.equal(state.editorBusy, true);
  assert.deepEqual(state.pendingRows, [row.id]);
  reply.reject(new Error('Нет связи')); await save;
  assert.equal(state.editor.values.fio, 'Изменено'); assert.equal(state.editorError, 'Нет связи');
  assert.equal(state.editorBusy, false); assert.deepEqual(state.pendingRows, []);
});

test('pending upload blocks saving its row until the shared row lock is released', async () => {
  const upload = deferred();
  let updates = 0;
  const { state, actions } = setup({
    uploadFiles: () => upload.promise,
    updateRecord: async () => { updates++; return row; },
  });
  await actions.initialize();
  actions.requestEdit(row);
  const uploading = actions.upload(row);
  await actions.saveRecord();
  assert.equal(updates, 0);
  assert.equal(state.editorBusy, false);
  assert.equal(state.editor.rowId, row.id);
  assert.deepEqual(state.pendingRows, [row.id]);

  upload.resolve({ cancelled: true });
  await uploading;
  assert.deepEqual(state.pendingRows, []);
  await actions.saveRecord();
  assert.equal(updates, 1);
  assert.equal(state.editor, null);
});

test('disposal prevents concurrent list, record and attachment completions from changing state', async () => {
  const listing = deferred(), update = deferred(), upload = deferred();
  const otherRow = { ...row, id: 'other-row' };
  let lists = 0;
  const { state, actions } = setup({
    list: () => ++lists === 1 ? page([row, otherRow]) : listing.promise,
    updateRecord: () => update.promise,
    uploadFiles: () => upload.promise,
  });
  await actions.initialize();
  actions.requestEdit(row);
  const saving = actions.saveRecord();
  const uploading = actions.upload(otherRow);
  const refreshing = actions.refresh();
  assert.deepEqual(state.pendingRows, [row.id, otherRow.id]);
  actions.dispose();
  const snapshot = JSON.stringify(state);

  update.resolve({ ...row, values: { ...row.values, fio: 'Позднее изменение' } });
  upload.resolve({ cancelled: false, files: [{ id: 'late-file', name: 'late.pdf' }] });
  listing.resolve(page([]));
  await Promise.all([saving, uploading, refreshing]);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(lists, 2);
});

test('confirmed update survives failed refresh and closes only its own editor', async () => {
  let lists = 0; let received;
  const changed = { ...row, values: { ...row.values, fio: 'Новое имя', initiator: '' } };
  const { state, actions } = setup({ list: async () => { if (++lists > 1) throw new Error('refresh failed'); return page(); }, updateRecord: async request => { received = request; return changed; } });
  await actions.initialize(); actions.requestEdit(row);
  assert.equal(state.editor.values.initiator, 'Инициатор');
  actions.setEditorValue('fio', 'Новое имя'); actions.setEditorValue('initiator', ''); await actions.saveRecord();
  assert.equal(received.rowId, row.id); assert.equal(received.values.fio, 'Новое имя');
  assert.equal(received.values.initiator, '');
  assert.equal(state.rows[0].values.fio, 'Новое имя'); assert.equal(state.editor, null);
  assert.equal(state.notice, 'Запись сохранена.'); assert.equal(state.error, 'refresh failed');
});

test('confirmed create survives failed refresh without losing generated ID', async () => {
  let lists = 0;
  const { state, actions } = setup({ list: async () => { if (++lists > 1) throw new Error('offline'); return page([], 0); }, createRecord: async () => row });
  await actions.initialize(); actions.requestCreate(); await actions.saveRecord();
  assert.equal(state.rows[0].id, row.id); assert.equal(state.total, 1); assert.equal(state.editor, null); assert.equal(state.notice, 'Запись создана.');
});

test('attached row deletion is explained and never sent; failed deletion remains retryable', async () => {
  let calls = 0;
  const { state, actions } = setup({ deleteRecord: async () => { calls++; throw new Error('denied'); } });
  await actions.initialize(); actions.requestDelete({ ...row, files: [{ id: 'f', name: 'a.pdf' }] }); await actions.confirmDelete();
  assert.equal(calls, 0); assert.match(state.rowDeleteError, /файл/);
  actions.closeDelete(); actions.requestDelete(row); await actions.confirmDelete();
  assert.equal(calls, 1); assert.equal(state.rowDeleteTarget.id, row.id); assert.equal(state.rowDeleteError, 'denied');
  assert.equal(state.rows.length, 1); assert.equal(state.rowDeleteBusy, false);
});

test('confirmed deletion preserves success on refresh failure and moves off emptied last page', async () => {
  let lists = 0;
  const { state, actions } = setup({ list: async () => { if (++lists > 1) throw new Error('offline'); return page([row], 26); }, deleteRecord: async () => ({ deleted: true }) });
  await actions.initialize(); state.page = 2; actions.requestDelete(row); await actions.confirmDelete();
  assert.equal(state.page, 1); assert.equal(state.total, 25); assert.deepEqual(state.rows, []);
  assert.equal(state.rowDeleteTarget, null); assert.equal(state.notice, 'Запись удалена.'); assert.equal(state.error, 'offline');
});

test('late refresh after successful save cannot close a newly opened editor', async () => {
  const refresh = deferred(); let lists = 0;
  const { state, actions } = setup({ list: () => ++lists === 1 ? page() : refresh.promise, updateRecord: async () => row });
  await actions.initialize(); actions.requestEdit(row); const save = actions.saveRecord(); await Promise.resolve(); await Promise.resolve();
  actions.requestCreate(); const newer = state.editor;
  refresh.resolve(page()); await save;
  assert.equal(state.editor, newer); assert.equal(state.editor.mode, 'create');
});

test('disposed page ignores pending create completion', async () => {
  const reply = deferred(); const { state, actions } = setup({ createRecord: () => reply.promise });
  await actions.initialize(); actions.requestCreate(); const pending = actions.saveRecord(); actions.dispose();
  const snapshot = JSON.stringify(state); reply.resolve(row); await pending; assert.equal(JSON.stringify(state), snapshot);
});

test('legacy capabilities disable all row mutations', async () => {
  const { state, actions } = setup({ getCapabilities: async () => ({ available: true, list: true }) });
  await actions.initialize(); actions.requestCreate(); actions.requestEdit(row); actions.requestDelete(row);
  assert.equal(state.editor, null); assert.equal(state.rowDeleteTarget, null);
  const service = new RecordsService({ getApi: () => ({ getCapabilities: async () => ({ available: true, list: true }) }) });
  const caps = await service.getCapabilities(); for (const key of ['create', 'update', 'delete']) assert.equal(caps[key], false);
});

test('renderer service validates mutation DTOs, preserves IDs and requires deletion confirmation', async () => {
  const service = new RecordsService({ getApi: () => ({ createRecord: async () => row, updateRecord: async () => ({ values: {} }), deleteRecord: async () => ({ deleted: false }) }) });
  assert.equal((await service.createRecord({ values: {} })).id, row.id);
  await assert.rejects(service.updateRecord({ rowId: row.id, values: { note: '' } }), /идентификатор/);
  await assert.rejects(service.deleteRecord({ rowId: row.id }), /не подтвердил/);
});
