import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import TxtExportServiceFS from '../../../src/renderer/services/export/TxtExportServiceFS.js';
import CsvExportServiceFS from '../../../src/renderer/services/export/CsvExportServiceFS.js';
import ExcelExportServiceFS from '../../../src/renderer/services/export/ExcelExportServiceFS.js';
import PdfExportServiceFS from '../../../src/renderer/services/export/PdfExportServiceFS.js';
import CsvExportService from '../../../src/renderer/services/export/csvExportService.js';
import TxtExportService from '../../../src/renderer/services/export/txtExportService.js';
import ManagerExport from '../../../src/renderer/services/export/MenegerExport.js';
import { buildPdfDefinition } from '../../../src/renderer/services/export/exportContent.js';
import { EXPORT_FORMATS, getExportFormat } from '../../../src/renderer/services/export/exportFormats.js';

function captureDownload(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const downloads = [];
  const revoked = [];
  const links = [];
  const link = { click() {} };
  globalThis.document = {
    createElement: () => link,
    body: {
      appendChild(element) { links.push(element); },
      removeChild(element) { links.splice(links.indexOf(element), 1); },
    },
  };
  t.mock.method(URL, 'createObjectURL', (blob) => {
    downloads.push(blob);
    return 'blob:export-test';
  });
  t.mock.method(URL, 'revokeObjectURL', (url) => revoked.push(url));
  t.after(() => {
    t.mock.timers.tick(0);
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else delete globalThis.document;
  });
  return { downloads, link, revoked, links, finishDownload: () => t.mock.timers.tick(0) };
}

const data = [
  {
    type: 'object_data',
    source: 'records',
    fields: [
      ['fio', 'Тестовая запись'],
      ['mail', 'sample@example.test'],
    ],
  },
];

test('TXT and CSV include records even when the server sends no source metadata', () => {
  const txt = new TxtExportServiceFS().export(data);
  const csv = new CsvExportServiceFS().export(data);

  assert.ok(txt.includes('Источник: records'));
  assert.ok(txt.includes('Тестовая запись'));
  assert.ok(csv.includes('Тестовая запись'));
  assert.ok(csv.includes('sample@example.test'));
});

test('Excel preserves every record without source metadata', () => {
  const binary = new ExcelExportServiceFS().export(data);
  const workbook = XLSX.read(binary, { type: 'array' });

  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.records), [
    { fio: 'Тестовая запись', mail: 'sample@example.test' },
  ]);
});

test('PDF export produces a PDF buffer with the bundled font configuration', async () => {
  const binary = await new PdfExportServiceFS().export(data);

  assert.ok(binary.byteLength > 1000);
  assert.equal(Buffer.from(binary).subarray(0, 5).toString(), '%PDF-');
});

test('browser CSV preserves values when field names need CSV escaping', async (t) => {
  const { downloads, link } = captureDownload(t);
  new CsvExportService().export([
    {
      type: 'object_data',
      source: 'records',
      fields: [
        ['поле,ключ', 'значение,с запятой'],
        ['поле"кавычка', '"цитата"'],
        ['строка\nключ', 'первая\nвторая'],
      ],
    },
  ]);

  assert.equal(link.download, 'результат.csv');
  assert.equal(
    Buffer.from(await downloads[0].arrayBuffer()).toString('utf8'),
    '\uFEFF"Источник: records"\n\n"поле,ключ","поле""кавычка","строка\nключ"\n' +
      '"значение,с запятой","""цитата""","первая\nвторая"\n',
  );
});

test('CSV browser and filesystem exports retain their metadata quoting', async (t) => {
  const { downloads } = captureDownload(t);
  const records = [
    { type: 'object_data_base', source: 'records', name: 'Архив', info: 'Описание' },
    { type: 'object_data', source: 'records', fields: [['fio', 'Иван'], ['count', 0]] },
    { type: 'object_data', source: 'records', fields: [['enabled', false], ['fio', null]] },
  ];

  new CsvExportService().export(records);
  const table = '\nfio,count,enabled\nИван,0,\n,,false\n';
  assert.equal(new CsvExportServiceFS().export(records), '\uFEFFИсточник: Архив\nОписание\n' + table);
  assert.equal(Buffer.from(await downloads[0].arrayBuffer()).toString('utf8'), '\uFEFF"Источник: Архив"\n"Описание"\n' + table);
});

test('TXT browser and filesystem exports preserve identical Unicode text and group separators', async (t) => {
  const { downloads, link } = captureDownload(t);
  const records = [
    { type: 'object_data', source: 'first', fields: [['fio', 'Иван 😃'], ['count', 0], ['empty', null]] },
    { type: 'object_data_base', source: 'first', name: 'Первый архив', info: 'Описание' },
    { type: 'object_data_base', source: 'second', name: 'Пустой архив' },
  ];
  const expected = 'Источник: Первый архив\nОписание\n\nfio = Иван 😃\ncount = 0\nempty = \n\n' +
    '-----------------------\n\nИсточник: Пустой архив\n\nНет данных\n\n';

  new TxtExportService().export(records);
  assert.equal(new TxtExportServiceFS().export(records), expected);
  assert.equal(await downloads[0].text(), expected);
  assert.equal(link.download, 'результат.txt');
});

test('Excel creates distinct valid sheet names and preserves empty source groups', () => {
  const records = [
    { type: 'object_data_base', source: 'first', name: 'A/B' },
    { type: 'object_data_base', source: 'second', name: 'A\\B' },
    { type: 'object_data_base', source: 'third', name: 'Я'.repeat(35) },
    { type: 'object_data_base', source: 'fourth', name: 'Я'.repeat(35) },
  ];
  const workbook = XLSX.read(new ExcelExportServiceFS().export(records), { type: 'array' });

  assert.deepEqual(workbook.SheetNames, ['A_B', 'A_B_1', 'Я'.repeat(31), 'Я'.repeat(29) + '_1']);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.A_B), [{ 'Нет данных': '' }]);
});

test('browser text export releases its object URL and temporary link', (t) => {
  const { revoked, links, finishDownload } = captureDownload(t);

  new TxtExportService().export(data);

  assert.deepEqual(revoked, []);
  finishDownload();
  assert.deepEqual(revoked, ['blob:export-test']);
  assert.deepEqual(links, []);
});

test('export manager rejects inherited object keys as unsupported formats', () => {
  const manager = new ManagerExport();

  assert.throws(() => manager.export(data, '__proto__'), /Export format "__proto__" is not supported/);
  assert.throws(() => manager.export(data, 'toString'), /Export format "toString" is not supported/);
});

test('PDF document content preserves Cyrillic source metadata, records and empty groups', () => {
  const records = [
    { type: 'object_data', source: 'first', fields: [['fio', 'Иван'], ['count', 0], ['empty', null]] },
    { type: 'object_data_base', source: 'first', name: 'Первый архив', info: 'Описание' },
    { type: 'object_data_base', source: 'second', name: 'Пустой архив' },
  ];
  const original = structuredClone(records);
  const definition = buildPdfDefinition(records);

  assert.deepEqual(definition.defaultStyle, { font: 'Roboto' });
  assert.deepEqual(definition.content, [
    { text: 'Источник: Первый архив', style: 'header' },
    { text: 'Описание', style: 'subheader', margin: [0, 0, 0, 10] },
    {
      stack: [
        { text: 'fio: Иван', margin: [0, 0, 0, 2] },
        { text: 'count: 0', margin: [0, 0, 0, 2] },
        { text: 'empty: ', margin: [0, 0, 0, 2] },
      ],
      margin: [0, 0, 0, 10],
      style: 'recordBlock',
    },
    { text: '', margin: [0, 0, 0, 10] },
    { text: 'Источник: Пустой архив', style: 'header' },
    { text: '', style: 'subheader', margin: [0, 0, 0, 10] },
    { text: 'Нет данных', italics: true, margin: [0, 0, 0, 15] },
  ]);
  assert.deepEqual(records, original);
});

test('export format registry drives every browser and filesystem exporter', async () => {
  const manager = new ManagerExport();
  assert.deepEqual(Object.keys(manager.exporters).sort(), [
    'csv', 'csvFs', 'excel', 'excelFs', 'pdf', 'pdfFs', 'txt', 'txtFs',
  ]);

  const txt = manager.export(data, getExportFormat('txt').fsFormat);
  const csv = manager.export(data, getExportFormat('csv').fsFormat);
  const excel = manager.export(data, getExportFormat('excel').fsFormat);
  const pdf = await manager.export(data, getExportFormat('pdf').fsFormat);
  assert.equal(typeof txt, 'string');
  assert.equal(typeof csv, 'string');
  assert.ok(excel instanceof Uint8Array);
  assert.ok(pdf instanceof Uint8Array);
  assert.equal(getExportFormat('excel').extension, 'xlsx');
  assert.equal(EXPORT_FORMATS.length, 4);
  assert.throws(() => getExportFormat('unknown'), /Export format "unknown" is not supported/);
});
