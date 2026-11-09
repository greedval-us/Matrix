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

function setup({ openFolder = async () => 'C:/reports', saveDialog = async () => null,
  write = async () => true, searchAPI = {} } = {}) {
  globalThis.window = {
    searchAPI: { createClient: async () => ({}), destroyClient: async () => {},
      onProgress: () => () => {}, run: async () => ({}), cancel: () => {}, ...searchAPI },
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

function streamingSearchBridge({ failOrdinary = false } = {}) {
  const listeners = new Set();
  const runs = [];
  return { runs, api: {
    onProgress(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async run(tabId, query) {
      runs.push(tabId);
      const report = String(tabId).startsWith('report-');
      if (!report && failOrdinary) throw new Error('Ordinary search failed');
      for (const listener of listeners) listener({ tabId, type: 'chunk', received: 1,
        items: [{ object_data: { source_name: report ? 'report-source' : 'ordinary-source',
          fields: { number: query.number } } }] });
      return { total_hits: 1, returned_hits: 1 };
    },
  } };
}

test('ordinary search reveals streamed results while preserving its collapsed report', async () => {
  const bridge = streamingSearchBridge();
  const { search, id } = setup({ searchAPI: bridge.api });
  await search.collectReport(id);
  const state = search.getReportState(id);
  const report = state.report;
  const progress = state.progress;
  assert.equal(state.expanded, true);
  assert.equal(report.records.length, 1);

  await search.search(id);

  assert.equal(state.expanded, false);
  assert.equal(search.getReportState(id), state);
  assert.equal(state.report, report);
  assert.equal(state.progress, progress);
  assert.equal(state.loading, false);
  assert.equal(search.getLoading(id), false);
  assert.equal(search.getError(id), '');
  assert.equal(search.getReceived(id), 1);
  assert.deepEqual(search.getResults(id).map(item => item.source), ['ordinary-source']);
  assert.equal(bridge.runs.filter(tabId => tabId === id).length, 1);
});

test('a preserved report reopens without another request and the next search collapses it again', async () => {
  const bridge = streamingSearchBridge();
  const { search, id } = setup({ searchAPI: bridge.api });
  await search.collectReport(id);
  const state = search.getReportState(id);
  const report = state.report;
  await search.search(id);
  const requestCount = bridge.runs.length;

  search.expandReport(id);

  assert.equal(state.expanded, true);
  assert.equal(state.report, report);
  assert.equal(bridge.runs.length, requestCount);
  await search.search(id);
  assert.equal(state.expanded, false);
  assert.equal(state.report, report);
  assert.equal(bridge.runs.filter(tabId => tabId === id).length, 2);
  await search.collectReport(id);
  assert.equal(search.getReportState(id).expanded, true);
  assert.notEqual(search.getReportState(id), state);
});

test('ordinary search collapses only the report belonging to its tab', async () => {
  const bridge = streamingSearchBridge();
  const { tabs, search, id } = setup({ searchAPI: bridge.api });
  const otherId = tabs.addTab();
  search.toggleField(otherId, 'number');
  search.setFieldValue(otherId, 'number', '70000000001');
  await search.collectReport(id);
  await search.collectReport(otherId);
  const otherReport = search.getReportState(otherId).report;

  await search.search(id);

  assert.equal(search.getReportState(id).expanded, false);
  assert.equal(search.getReportState(otherId).expanded, true);
  assert.equal(search.getReportState(otherId).report, otherReport);
});

test('an empty ordinary query leaves its report open and sends no search request', async () => {
  const bridge = streamingSearchBridge();
  const { search, id } = setup({ searchAPI: bridge.api });
  await search.collectReport(id);
  search.setFieldValue(id, 'number', '');

  await search.search(id);

  assert.equal(search.getReportState(id).expanded, true);
  assert.equal(bridge.runs.filter(tabId => tabId === id).length, 0);
});

test('a duplicate ordinary search does not collapse a report reopened during the pending request', async () => {
  let finishSearch, notifyStarted;
  const request = new Promise(resolve => { finishSearch = resolve; });
  const started = new Promise(resolve => { notifyStarted = resolve; });
  const bridge = streamingSearchBridge();
  const { search, id } = setup({ searchAPI: { ...bridge.api,
    run(tabId, query) {
      if (String(tabId).startsWith('report-')) return bridge.api.run(tabId, query);
      notifyStarted();
      return request;
    },
  } });
  await search.collectReport(id);
  const running = search.search(id);
  await started;
  search.expandReport(id);

  await search.search(id);

  assert.equal(search.getReportState(id).expanded, true);
  assert.equal(search.getLoading(id), true);
  finishSearch({ total_hits: 0, returned_hits: 0 });
  await running;
  assert.equal(search.getReportState(id).expanded, true);
});

test('a failed ordinary search preserves its collapsed report and exposes the search error', async () => {
  const bridge = streamingSearchBridge({ failOrdinary: true });
  const { search, id } = setup({ searchAPI: bridge.api });
  await search.collectReport(id);
  const state = search.getReportState(id);
  const report = state.report;

  await search.search(id);

  assert.equal(state.expanded, false);
  assert.equal(state.report, report);
  assert.equal(state.error, '');
  assert.equal(search.getError(id), 'Ordinary search failed');
  assert.equal(search.getLoading(id), false);
});

for (const outcome of ['cancelled', 'failed']) {
  test(`ordinary search can replace the visible ${outcome} report outcome`, async () => {
    const bridge = streamingSearchBridge();
    let finishConnection;
    const connection = new Promise(resolve => { finishConnection = resolve; });
    const { search, id } = setup({ searchAPI: { ...bridge.api,
      async createClient(tabId) {
        if (String(tabId).startsWith('report-')) {
          if (outcome === 'failed') throw new Error('Report connection failed');
          await connection;
        }
        return {};
      },
    } });
    const collecting = search.collectReport(id);
    if (outcome === 'cancelled') { search.cancelReport(id); finishConnection(); }
    await collecting;
    const state = search.getReportState(id);
    const report = state.report;
    const error = state.error;
    assert.equal(state.expanded, true);
    assert.equal(state.loading, false);
    assert.equal(state.stopping, false);
    if (outcome === 'cancelled') assert.equal(report.cancelled, true);
    else assert.equal(error, 'Report connection failed');

    await search.search(id);

    assert.equal(state.expanded, false);
    assert.equal(state.report, report);
    assert.equal(state.error, error);
    assert.deepEqual(search.getResults(id).map(item => item.source), ['ordinary-source']);
    search.expandReport(id);
    assert.equal(state.expanded, true);
  });
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
  assert.equal(state.expanded, true);
  await search.collectReport(id);
  await search.search(id);
  assert.equal(state.expanded, true);
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

for (const outcome of ['saved', 'failed']) {
  test(`a late ${outcome} report save cannot change replacement tab state`, async (t) => {
    let finishSave, failSave, notifySaving;
    const savingStarted = new Promise(resolve => { notifySaving = resolve; });
    t.mock.method(ReportService.prototype, 'collect', async () => fixtureReport());
    const { search, id } = setup({
      saveDialog: async () => 'C:/reports/report.docx',
      write: () => {
        notifySaving();
        return new Promise((resolve, reject) => { finishSave = resolve; failSave = reject; });
      },
    });
    await search.collectReport(id);
    const saving = search.saveCollectedReport(id);
    await savingStarted;
    const cleared = search.getReportState(id);
    search.clearTab(id);
    await search.collectReport(id);
    const replacement = search.getReportState(id);
    if (outcome === 'saved') finishSave(true);
    else failSave(new Error('Late disk failure'));
    await saving;
    assert.equal(search.getReportState(id), replacement);
    assert.equal(replacement.error, '');
    assert.equal(replacement.notice, '');
    assert.equal(replacement.saving, false);
    assert.equal(replacement.report.records.length, 1);
    assert.equal(cleared.notice, '');
    assert.equal(cleared.error, '');
    assert.equal(cleared.saving, true);
  });
}

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
