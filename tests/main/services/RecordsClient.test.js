import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordsService, normalizeRecordsPage } from '../../../src/renderer/services/RecordsService.js';
import { createRecordsState, createRecordsWorkflow } from '../../../src/renderer/services/records/recordsWorkflow.js';
import { getRecordValue, formatRecordValue, formatAttachmentSize } from '../../../src/renderer/utils/records.js';

const capabilities = { available: true, list: true, upload: true, download: true, remove: true, message: '' };
const file = { id: 'file-1', name: 'report.pdf', size: 0 };
const row = { id: 'row-1', values: { score: 2 }, files: [file] };
const page = (rows = [row], total = rows.length) => ({ columns: [{ key: 'score', label: 'Оценка', sortable: true }], rows, total });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(overrides = {}, timers = {}) {
  const state = createRecordsState();
  const service = { getCapabilities: async () => capabilities, list: async () => page(), ...overrides };
  return { state, service, actions: createRecordsWorkflow({ state, service, ...timers }) };
}

test('unknown columns are derived from all rows and reserved-looking fields stay ordinary values', () => {
  const result = normalizeRecordsPage({ total: 2, rows: [
    { id: 0, values: JSON.parse('{"files":"ordinary data","__proto__":"own value","zero":0}'), files: [file] },
    { id: 'row-2', values: { later_column: false } },
  ] }, { pageSize: 25 });
  assert.deepEqual(result.columns.map(column => column.key), ['files', '__proto__', 'zero', 'later_column']);
  assert.equal(result.rows[0].id, '0');
  assert.equal(getRecordValue(result.rows[0], '__proto__'), 'own value');
  assert.equal(getRecordValue(result.rows[1], 'constructor'), null);
  assert.equal(formatRecordValue(getRecordValue(result.rows[0], 'zero')), '0');
  assert.equal(formatRecordValue(false), 'Нет');
  assert.equal(formatAttachmentSize(0), '0 Б');
});

test('stable row/file IDs and schema uniqueness are required before rendering attachments', () => {
  assert.throws(() => normalizeRecordsPage({ rows: [{ values: {} }], total: 1 }, { pageSize: 25 }), /идентификатор/);
  assert.throws(() => normalizeRecordsPage({ rows: [row, row], total: 2 }, { pageSize: 25 }), /Повторяющиеся/);
  assert.throws(() => normalizeRecordsPage({ rows: [{ ...row, files: [file, file] }], total: 1 }, { pageSize: 25 }), /Повторяющиеся/);
  assert.throws(() => normalizeRecordsPage({ ...page(), columns: [{ key: 'score' }, { key: 'score' }] }, { pageSize: 25 }), /столбцов/);
  assert.throws(() => normalizeRecordsPage(page([row], 0), { pageSize: 25 }), /количество/);
  assert.throws(() => normalizeRecordsPage(page([{ ...row, id: 'row\u0000bad' }]), { pageSize: 25 }), /идентификатор/);
});

test('client service forwards server pagination/search/sort and requires confirmed file outcomes', async () => {
  let received;
  const service = new RecordsService({ getApi: () => ({
    list: async request => { received = request; return page(); },
    removeFile: async () => ({ removed: false }),
    downloadFile: async () => ({ cancelled: true }),
    uploadFiles: async () => ({ cancelled: true }),
  }) });
  const request = { query: 'server query', page: 3, pageSize: 25, sort: { key: 'score', direction: 'desc' } };
  await service.list(request);
  assert.equal(received, request);
  await assert.rejects(service.removeFile({ rowId: row.id, fileId: file.id }), /не подтвердил/);
  assert.deepEqual(await service.downloadFile({ rowId: row.id, fileId: file.id }), { cancelled: true, saved: false });
  assert.deepEqual(await service.uploadFiles({ rowId: row.id }), { cancelled: true, files: [] });
});

test('unconfigured client is honest and never requests rows or opens file dialogs', async () => {
  let requests = 0;
  const { state, actions } = setup({ getCapabilities: async () => ({ available: false, list: false }), list: async () => { ++requests; } });
  await actions.initialize();
  await actions.upload(row);
  assert.equal(requests, 0);
  assert.deepEqual(state.rows, []);
  assert.equal(state.connecting, false);
  actions.dispose();
});

test('late page replies and errors cannot overwrite a newer search result', async () => {
  const older = deferred();
  const newer = deferred();
  let requests = 0;
  const { state, actions } = setup({ list: () => (++requests === 1 ? older.promise : newer.promise) });
  const initial = actions.initialize();
  await Promise.resolve();
  state.query = 'new query';
  const refresh = actions.refresh();
  newer.resolve(page([{ ...row, id: 'new-row' }]));
  await refresh;
  older.reject(new Error('stale failure'));
  await initial;
  assert.equal(state.rows[0].id, 'new-row');
  assert.equal(state.error, '');
  assert.equal(state.loading, false);
  actions.dispose();
});

test('search is debounced and invalidates pending replies immediately', async () => {
  const queued = new Map();
  let timerId = 0;
  const queries = [];
  const { state, actions } = setup({ list: async request => { queries.push(request.query); return page(); } }, {
    setTimer: callback => { queued.set(++timerId, callback); return timerId; }, clearTimer: id => queued.delete(id),
  });
  await actions.initialize();
  actions.setQuery('first');
  actions.setQuery(' second ');
  assert.equal(queued.size, 1);
  assert.equal(state.page, 1);
  await [...queued.values()][0]();
  assert.deepEqual(queries, ['', 'second']);
  actions.dispose();
  assert.equal(queued.size, 0);
});

test('sort, page size and page controls use the full server result, not a local page subset', async () => {
  const requests = [];
  const { state, actions } = setup({ list: async request => { requests.push(request); return page([row], 101); } });
  await actions.initialize();
  await actions.setPage(4);
  assert.equal(requests.at(-1).page, 4);
  await actions.setSort('score');
  assert.deepEqual(requests.at(-1).sort, { key: 'score', direction: 'asc' });
  assert.equal(state.page, 1);
  await actions.setSort('score');
  assert.equal(requests.at(-1).sort.direction, 'desc');
  await actions.setPageSize(50);
  assert.equal(requests.at(-1).pageSize, 50);
  assert.equal(requests.at(-1).page, 1);
  const count = requests.length;
  actions.setPageSize(999);
  actions.setSort('unknown column');
  assert.equal(requests.length, count);
  actions.dispose();
});

test('a deleted last server page is recovered using the new last page', async () => {
  const requests = [];
  const { state, actions } = setup({ list: async request => { requests.push(request); return request.page === 1 ? page() : page([], 1); } });
  await actions.initialize();
  state.total = 51;
  await actions.setPage(3);
  assert.deepEqual(requests.map(request => request.page), [1, 3, 1]);
  assert.equal(state.page, 1);
  assert.equal(state.rows[0].id, row.id);
  assert.equal(state.loading, false);
  actions.dispose();
});

test('cancelled upload/download are normal outcomes without false success notices', async () => {
  let listCalls = 0;
  const { state, actions } = setup({
    list: async () => { ++listCalls; return page(); },
    uploadFiles: async () => ({ cancelled: true }), downloadFile: async () => ({ cancelled: true }),
  });
  await actions.initialize();
  await actions.upload(row);
  await actions.download({ row, file });
  assert.equal(state.notice, '');
  assert.equal(state.error, '');
  assert.equal(listCalls, 1);
  assert.equal(state.rows[0].files.length, 1);
  assert.deepEqual(state.pendingRows, []);
  actions.dispose();
});

test('confirmed upload is retained when the following refresh fails', async () => {
  const uploaded = { id: 'new-file', name: 'archive.zip', size: 12 };
  let listCalls = 0;
  const { state, actions } = setup({
    list: async () => { if (++listCalls > 1) throw new Error('refresh offline'); return page(); },
    uploadFiles: async () => ({ cancelled: false, files: [uploaded] }),
  });
  await actions.initialize();
  await actions.upload(row);
  assert.deepEqual(state.rows[0].files.map(item => item.id), [file.id, uploaded.id]);
  assert.equal(state.notice, 'Файлы добавлены.');
  assert.equal(state.error, 'refresh offline');
  assert.deepEqual(state.pendingRows, []);
  actions.dispose();
});

test('failed deletion keeps the file and confirmation open for retry', async () => {
  const { state, actions } = setup({ removeFile: async () => { throw new Error('access denied'); } });
  await actions.initialize();
  actions.requestRemove({ row, file });
  await actions.confirmRemove();
  assert.equal(state.deleteTarget.file.id, file.id);
  assert.equal(state.deleteError, 'access denied');
  assert.equal(state.rows[0].files.length, 1);
  assert.equal(state.deleteBusy, false);
  assert.equal(state.notice, '');
  assert.deepEqual(state.pendingRows, []);
  actions.closeRemove();
  assert.equal(state.deleteTarget, null);
  actions.dispose();
});

test('delete confirmation locks the row and double-submit until remote confirmation', async () => {
  const deletion = deferred();
  let calls = 0;
  let removed = false;
  const { state, actions } = setup({
    list: async () => page([{ ...row, files: removed ? [] : [file] }]),
    removeFile: async () => { ++calls; await deletion.promise; removed = true; return { removed: true }; },
  });
  await actions.initialize();
  actions.requestRemove({ row, file });
  const pending = actions.confirmRemove();
  actions.closeRemove();
  await actions.confirmRemove();
  assert.equal(calls, 1);
  assert.equal(state.deleteBusy, true);
  assert.ok(state.deleteTarget);
  assert.equal(state.rows[0].files.length, 1);
  deletion.resolve();
  await pending;
  assert.equal(state.deleteTarget, null);
  assert.equal(state.rows[0].files.length, 0);
  assert.equal(state.notice, 'Файл удалён.');
  assert.deepEqual(state.pendingRows, []);
  actions.dispose();
});

test('unmounted page ignores late data replies and scheduled searches', async () => {
  const reply = deferred();
  const { state, actions } = setup({ list: () => reply.promise });
  const initial = actions.initialize();
  await Promise.resolve();
  actions.dispose();
  reply.resolve(page());
  await initial;
  assert.deepEqual(state.rows, []);
});
