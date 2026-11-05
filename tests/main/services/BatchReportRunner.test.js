import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareBatchReportSeeds, runBatchReports } from '../../../src/renderer/services/report/batchReportRunner.js';

const seeds = prepareBatchReportSeeds('number', ['70000000000', '70000000001']).seeds;
const report = (overrides = {}) => ({ records: [{ fields: [['number', '70000000000']] }], stats: { records: 1 }, complete: true, ...overrides });

function options(overrides = {}) {
  const writes = [], logs = [];
  return { writes, logs, input: { seeds, folder: 'C:/reports',
    isCancelled: () => false, onLog: (message) => logs.push(message),
    fileService: { writeFile: async (bytes, path) => { writes.push({ bytes, path }); } },
    buildDocument: async () => new Uint8Array([80, 75]), getFileName: () => 'Отчёт.docx',
    createService: () => ({ collect: async () => report() }), ...overrides } };
}

test('batch report seeds canonicalize phone and document formatting while excluding masks and names', () => {
  const phones = prepareBatchReportSeeds('number', ['70000000000', '+7 (000) 000-00-00', '%', '70000000001']);
  assert.equal(phones.seeds.length, 2);
  assert.equal(phones.duplicates, 1);
  assert.equal(phones.invalid, 1);
  assert.equal(prepareBatchReportSeeds('fio', ['Иванов Иван']).seeds.length, 0);
  assert.equal(prepareBatchReportSeeds('snils', ['123-456-789 01', '12345678901']).seeds.length, 1);
});

test('batch report writes exactly one DOCX per distinct seed with its own collector', async () => {
  let services = 0;
  const requests = [];
  const { input, writes } = options({ createService: () => {
    services++;
    return { collect: async ({ seedQuery }) => { requests.push(seedQuery); return report(); } };
  } });
  await runBatchReports(input);
  assert.equal(services, 2);
  assert.deepEqual(requests, seeds.map((seed) => seed.query));
  assert.deepEqual(writes.map(({ path }) => path), ['C:/reports/1-Отчёт.docx', 'C:/reports/2-Отчёт.docx']);
  assert.ok(writes.every(({ bytes }) => bytes instanceof Uint8Array));
});

test('stopping a batch saves the received partial report and does not start the next seed', async () => {
  let cancelled = false, calls = 0;
  const { input, writes, logs } = options({ isCancelled: () => cancelled,
    createService: () => ({ collect: async () => { calls++; cancelled = true; return report({ cancelled: true, complete: false }); } }) });
  await runBatchReports(input);
  assert.equal(calls, 1);
  assert.deepEqual(writes.map(({ path }) => path), ['C:/reports/1-частичный-Отчёт.docx']);
  assert.ok(logs.some((line) => line.includes('Отчёт частичный')));
  assert.match(logs.at(-1), /остановлен/);
});

test('a report stopped before receiving any data creates no document', async () => {
  const { input, writes, logs } = options({ createService: () => ({ collect: async () => report({ cancelled: true, complete: false, records: [] }) }) });
  await runBatchReports(input);
  assert.equal(writes.length, 0);
  assert.match(logs.at(-1), /остановлен/);
});

test('stopping a batch preserves a report containing only server aggregates', async () => {
  let calls = 0;
  const { input, writes, logs } = options({ createService: () => ({ collect: async () => {
    calls++;
    return report({ records: [], aggregates: [{ id: 'aggregate-1', key: 'region', items: [{ value: 'Москва', count: 3 }] }],
      stats: { records: 0, aggregates: 1 }, cancelled: true, complete: false });
  } }) });
  await runBatchReports(input);
  assert.equal(calls, 1);
  assert.deepEqual(writes.map(({ path }) => path), ['C:/reports/1-частичный-Отчёт.docx']);
  assert.ok(logs.some((line) => line.includes('сводок сервера: 1')));
  assert.ok(!logs.some((line) => line.includes('Файл не создан')));
});

test('failed report collection is logged and remaining seeds still run', async () => {
  let calls = 0;
  const { input, writes, logs } = options({ createService: () => ({ collect: async () => {
    if (++calls === 1) throw new Error('offline');
    return report();
  } }) });
  await runBatchReports(input);
  assert.equal(calls, 2);
  assert.deepEqual(writes.map(({ path }) => path), ['C:/reports/2-Отчёт.docx']);
  assert.ok(logs.some((line) => line.includes('Ошибка отчёта 1: offline')));
});

test('batch keeps the DOCX extension and complete Unicode characters in exporter filenames', async () => {
  const fileName = `Отчёт Matrix ${'😀'.repeat(80)}.docx`;
  const { input, writes } = options({ seeds: seeds.slice(0, 1), getFileName: () => fileName });
  await runBatchReports(input);
  assert.equal(writes[0].path, `C:/reports/1-${fileName}`);
  assert.ok(writes[0].path.endsWith('.docx'));
});
