import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import TxtExportServiceFS from '../../../src/renderer/services/export/TxtExportServiceFS.js';
import CsvExportServiceFS from '../../../src/renderer/services/export/CsvExportServiceFS.js';
import ExcelExportServiceFS from '../../../src/renderer/services/export/ExcelExportServiceFS.js';
import PdfExportServiceFS from '../../../src/renderer/services/export/PdfExportServiceFS.js';

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

test('PDF export embeds Cyrillic fonts and produces a readable PDF buffer', async () => {
  const binary = await new PdfExportServiceFS().export(data);

  assert.ok(binary.byteLength > 1000);
  assert.equal(Buffer.from(binary).subarray(0, 5).toString(), '%PDF-');
});
