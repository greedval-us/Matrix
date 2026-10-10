import assert from 'node:assert/strict';
import test from 'node:test';
import { ReportService, saveReport } from '../../../src/renderer/services/report/ReportService.js';
import { SERVER_CONFIG_LIMITS } from '../../../src/shared/constants/serverConfig.js';

const seedQuery = { number: '79990000001' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function fakeSearch(overrides = {}) {
  const calls = [];
  return { calls,
    createClient: async id => { calls.push(['create', id]); },
    destroyClient: async id => { calls.push(['destroy', id]); },
    search: async (id, query) => { calls.push(['search', id, query]); return { meta: {} }; },
    cancelSearch: id => { calls.push(['cancel', id]); },
    ...overrides,
  };
}

test('report owns an isolated session and requests the existing maximum result limit', async () => {
  const service = fakeSearch();
  const collector = new ReportService({ searchService: service, createId: () => 1,
    collect: async ({ search }) => { await search(seedQuery); return { complete: true, warnings: [] }; } });
  await collector.collect({ seedQuery });
  assert.deepEqual(service.calls, [
    ['create', 'report-1'], ['search', 'report-1', { ...seedQuery, limit: SERVER_CONFIG_LIMITS.pageSize.max }],
    ['destroy', 'report-1'],
  ]);
  assert.equal(collector.operation, null);
});

test('invalid name-only report seeds never create a client', async () => {
  const service = fakeSearch();
  const collector = new ReportService({ searchService: service });
  await assert.rejects(collector.collect({ seedQuery: { fio: 'Иванов Иван' } }));
  assert.deepEqual(service.calls, []);
});

test('optional invalid seed fields remain visible as report warnings', async () => {
  const service = fakeSearch();
  const collector = new ReportService({ searchService: service });
  const report = await collector.collect({ seedQuery: { ...seedQuery, inn: '123%' } });
  assert.ok(report.warnings.some(warning => warning.includes('inn')));
  assert.equal(report.complete, false);
  assert.equal(service.calls.filter(([method]) => method === 'search').length, 1);
});

test('cancellation while connecting prevents all report queries and returns a cancelled report', async () => {
  const connection = deferred();
  let requests = 0;
  const service = fakeSearch({ createClient: () => connection.promise, search: async () => { ++requests; } });
  const collector = new ReportService({ searchService: service });
  const pending = collector.collect({ seedQuery });
  collector.cancel();
  connection.resolve();
  const report = await pending;
  assert.equal(requests, 0);
  assert.equal(report.cancelled, true);
  assert.equal(report.complete, false);
  assert.equal(collector.operation, null);
  assert.equal(service.calls.at(-1)[0], 'destroy');
});

test('a cancelled failed connection also returns a normal cancelled outcome', async () => {
  const connection = deferred();
  const service = fakeSearch({ createClient: () => connection.promise });
  const collector = new ReportService({ searchService: service });
  const pending = collector.collect({ seedQuery });
  collector.cancel();
  connection.reject(new Error('connection closed'));
  const report = await pending;
  assert.equal(report.cancelled, true);
  assert.equal(report.records.length, 0);
});

test('overlapping collection is rejected and failures release the service for retry', async () => {
  const connection = deferred();
  const service = fakeSearch({ createClient: () => connection.promise });
  const collector = new ReportService({ searchService: service });
  const pending = collector.collect({ seedQuery });
  await assert.rejects(collector.collect({ seedQuery }), /уже выполняется/);
  connection.reject(new Error('offline'));
  await assert.rejects(pending, /offline/);
  assert.equal(collector.operation, null);
});

test('cleanup failure preserves collected data and marks coverage incomplete', async () => {
  const service = fakeSearch({ destroyClient: async () => { throw new Error('close failed'); } });
  const collector = new ReportService({ searchService: service,
    collect: async () => ({ records: [{ id: 'r-1' }], warnings: [], complete: true }) });
  const report = await collector.collect({ seedQuery });
  assert.equal(report.records.length, 1);
  assert.equal(report.complete, false);
  assert.match(report.warnings[0], /close failed/);
});

test('cancelling DOCX destination skips generation and writing', async () => {
  let builds = 0;
  let writes = 0;
  const result = await saveReport({}, {
    fileApi: { saveDialog: async () => null, write: async () => { ++writes; } },
    loadExporter: async () => ({ getReportFileName: () => 'report.docx', buildReportDocx: () => { ++builds; } }),
  });
  assert.deepEqual(result, { cancelled: true, saved: false });
  assert.equal(builds, 0);
  assert.equal(writes, 0);
});

test('DOCX save writes binary bytes and does not claim success after a failed write', async () => {
  const bytes = new Uint8Array([80, 75, 3, 4]);
  let request;
  const options = {
    fileApi: { saveDialog: async (name, filters) => {
      assert.equal(name, 'report.docx');
      assert.deepEqual(filters[0].extensions, ['docx']);
      return 'D:/reports/report.docx';
    }, write: async (...args) => { request = args; return true; } },
    loadExporter: async () => ({ getReportFileName: () => 'report.docx', buildReportDocx: () => bytes }),
  };
  assert.equal((await saveReport({}, options)).saved, true);
  assert.deepEqual(request, ['D:/reports/report.docx', bytes, true]);
  options.fileApi.write = async () => false;
  await assert.rejects(saveReport({}, options), /сохранить/);
});
