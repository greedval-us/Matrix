import assert from 'node:assert/strict';
import test from 'node:test';
import { SearchResultSpool } from '../../../src/main/services/SearchResultSpool.js';

test('disk-backed search retains every document and reads bounded slices by source', async () => {
  const spool = await SearchResultSpool.create();
  try {
    const source = (key, name) => ({ object_data_base: { name_table: key, name } });
    const row = (key, fields) => ({ object_data: { source_name: key, fields } });
    await spool.append([
      { ...source('a', 'First'), field_labels: { number: 'Номер' } },
      row('a', { id: '1', number: '7978000', city: 'One' }),
      row('a', { city: 'One', number: '7978000', id: '2' }),
      row('a', { id: '3', number: '7978001', city: 'Two' }),
      source('b', 'Second'),
      row('b', { id: '4', number: '7978000', city: 'One' }),
    ]);
    const summary = await spool.summary();
    assert.equal(summary.recordCount, 4);
    assert.deepEqual(summary.sources.map(({ source, name, recordCount }) => [source, name, recordCount]), [
      ['a', 'First', 3], ['b', 'Second', 1],
    ]);
    assert.deepEqual(summary.fieldLabels, { number: 'Номер' });
    assert.deepEqual(await spool.read('a', 1, 1), [[['city', 'One'], ['number', '7978000']]]);
    assert.deepEqual(await spool.read('a', 2, 1), [[['number', '7978001'], ['city', 'Two']]]);
    assert.deepEqual(await spool.read('a', 3, 1), []);
    await assert.rejects(spool.read('a', 0, 10001), /диапазон/);
    let csv = '';
    for await (const chunk of spool.export('csv')) csv += chunk;
    assert.match(csv, /"Источник: First"\r\n"Номер","city"\r\n"7978000","One"\r\n"7978000","One"/u);
    assert.match(csv, /"Источник: Second"/u);
  } finally {
    await spool.close();
  }
});
