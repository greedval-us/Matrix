import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useTabStore } from '../../../src/renderer/stores/tabStore.js';
import { useSearchUIStore } from '../../../src/renderer/stores/uistore/serchStoreUI.js';
import { usePackagesSearchStoreUI } from '../../../src/renderer/stores/uistore/packejesSearchStoreUI.js';
import { ReportService } from '../../../src/renderer/services/report/ReportService.js';

function fixtureReport(overrides = {}) {
  return { seedQuery: { number: '70000000000' }, createdAt: '2026-10-10T10:00:00Z',
    queries: [], records: [{ id: 'record-1', fields: [['number', '70000000000']], sources: ['source-1'], queryIds: [] }],
    identifiers: [{ field: 'number', value: '70000000000', sources: ['source-1'] }],
    sources: [{ id: 'source-1', name: 'Тестовый источник' }],
    stats: { queries: 1, records: 1, sources: 1, identifiers: 1, duplicates: 0, pendingQueries: 0 },
    warnings: [], complete: true, cancelled: false, ...overrides };
}

function setup({ openFolder = async () => 'C:/reports', saveDialog = async () => null, write = async () => true } = {}) {
  globalThis.window = {
    searchAPI: { createClient: async () => ({}), destroyClient: async () => {},
      onProgress: () => () => {}, run: async () => ({}), cancel: () => {} },
    storeAPI: { addHistoryItem: async (key, value) => ({ key, value }) },
    fileDialog: { openFolder }, fileAPI: { saveDialog, write },
  };
  setActivePinia(createPinia());
  const tabs = useTabStore();
  const id = tabs.addTab();
  const search = useSearchUIStore();
  search.toggleField(id, 'number');
  search.setFieldValue(id, 'number', '70000000000');
  return { tabs, id, search };
}

test('report action requires an exact identifier and excludes names, dates and masks', () => {
  const { search, id } = setup();
  search.toggleField(id, 'number');
  for (const [field, value] of [['fio', 'Иванов Иван'], ['date_of_birth', '01.01.1990']]) {
    search.toggleField(id, field);
    search.setFieldValue(id, field, value);
  }
  assert.equal(search.canCollectReport(id), false);
  search.toggleField(id, 'number');
  search.setFieldValue(id, 'number', '7000000%');
  assert.equal(search.canCollectReport(id), false);
  search.setFieldValue(id, 'number', '+7 (000) 000-00-00');
  assert.equal(search.canCollectReport(id), true);
});

test('report job snapshots its seed, prevents duplicate work and keeps ordinary results', async (t) => {
  let resolveReport, options;
  let calls = 0;
  t.mock.method(ReportService.prototype, 'collect', (value) => {
    calls++;
    options = value;
    return new Promise((resolve) => { resolveReport = resolve; });
  });
  const { search, id } = setup();
  search.toggleField(id, 'fio');
  search.setFieldValue(id, 'fio', 'Иванов Иван');
  search.toggleField(id, 'inn');
  search.setFieldValue(id, 'inn', '123%');
  search.appendResults(id, [{ object_data: { source_name: 'normal', fields: { number: 'original' } } }]);
  const running = search.collectReport(id);
  const state = search.getReportState(id);
  assert.equal(state.loading, true);
  await search.collectReport(id);
  await search.search(id);
  search.setFieldValue(id, 'number', '70000000001');
  assert.equal(options.seedQuery.number, '70000000000');
  assert.equal(options.seedQuery.fio, 'Иванов Иван');
  assert.equal(options.seedQuery.inn, '123%');
  options.onProgress({ type: 'query-completed', stats: { records: 1 } });
  assert.equal(state.progress.stats.records, 1);
  const report = fixtureReport({ complete: false, warnings: ['Частичная выдача'] });
  resolveReport(report);
  await running;
  assert.equal(calls, 1);
  assert.equal(state.loading, false);
  assert.equal(state.report, report);
  assert.deepEqual(search.getResults(id).map((item) => item.source), ['normal']);
});

test('closing a tab cancels its report and ignores late progress and completion', async (t) => {
  let resolveReport, options, cancelled = 0;
  t.mock.method(ReportService.prototype, 'collect', (value) => {
    options = value;
    return new Promise((resolve) => { resolveReport = resolve; });
  });
  t.mock.method(ReportService.prototype, 'cancel', () => { cancelled++; });
  const { tabs, search, id } = setup();
  tabs.addTab();
  const running = search.collectReport(id);
  search.clearTab(id);
  tabs.closeTab(id);
  options.onProgress({ type: 'query-completed', stats: { records: 100 } });
  resolveReport(fixtureReport());
  await running;
  assert.equal(cancelled, 1);
  assert.equal(search.getReportState(id), null);
});

test('stopped reports preserve received records; cancelled native save never reports success', async (t) => {
  let resolveReport, cancelled = 0, writes = 0;
  t.mock.method(ReportService.prototype, 'collect', () => new Promise((resolve) => { resolveReport = resolve; }));
  t.mock.method(ReportService.prototype, 'cancel', () => { cancelled++; });
  const { search, id } = setup({ write: async () => { writes++; } });
  const running = search.collectReport(id);
  search.cancelReport(id);
  assert.equal(search.getReportState(id).stopping, true);
  resolveReport(fixtureReport({ cancelled: true, complete: false }));
  await running;
  const state = search.getReportState(id);
  assert.equal(cancelled, 1);
  assert.equal(state.report.records.length, 1);
  await search.saveCollectedReport(id);
  assert.equal(writes, 0);
  assert.equal(state.saving, false);
  assert.equal(state.notice, '');
});

test('batch report mode skips invalid seeds and merges canonical duplicates without requiring legacy formats', async (t) => {
  const seeds = [], writes = [];
  t.mock.method(ReportService.prototype, 'collect', async ({ seedQuery }) => {
    seeds.push(seedQuery);
    return fixtureReport({ seedQuery });
  });
  setup({ write: async (path, bytes, binary) => { writes.push({ path, bytes, binary }); return true; } });
  const store = usePackagesSearchStoreUI();
  store.mode = 'report';
  store.formats = {};
  store.queryText = '70000000000\n+7 (000) 000-00-00\n70000000001\n7000000%';
  await store.runSearch();
  assert.deepEqual(seeds, [{ number: '70000000000' }, { number: '70000000001' }]);
  assert.equal(writes.length, 2);
  assert.ok(writes.every(({ path, bytes, binary }) => path.endsWith('.docx') && bytes instanceof Uint8Array && binary));
  assert.ok(store.logs.some((line) => line.includes('Повторяющихся значений объединено: 1')));
  assert.ok(store.logs.some((line) => line.includes('Пропущено значений без точного идентификатора: 1')));
});

test('cancelling batch report folder selection starts no report and writes no file', async (t) => {
  let folderReady, calls = 0, writes = 0;
  t.mock.method(ReportService.prototype, 'collect', async () => { calls++; return fixtureReport(); });
  setup({ openFolder: () => new Promise((resolve) => { folderReady = resolve; }), write: async () => { writes++; } });
  const store = usePackagesSearchStoreUI();
  store.mode = 'report';
  store.queryText = '70000000000';
  const running = store.runSearch();
  store.cancelSearch();
  folderReady('C:/reports');
  await running;
  assert.equal(calls, 0);
  assert.equal(writes, 0);
  assert.equal(store.isRunning, false);
});
