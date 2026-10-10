import assert from 'node:assert/strict';
import test from 'node:test';
import { collectReport } from '../../../src/renderer/services/report/collectReport.js';
import { canonicalizeReportIdentifier, getReportSeedQuery } from '../../../src/shared/utils/reportIdentifiers.js';

const PHONE = '70000000000';
const PASSPORT = '1234567890';
const SNILS = '12345678901';
const row = (source, fields) => ({ object_data: { source_name: source, fields } });
const metadata = (count = 0, extra = {}) => ({ meta: { total_hits: String(count), returned_hits: String(count), ...extra } });

test('report follows phone, passport and SNILS globally, merging exact duplicates and preserving provenance', async () => {
  const calls = [];
  const progress = [];
  const report = await collectReport({
    seedQuery: { number: PHONE, fio: 'Иванов Иван', date_of_birth: '01.01.1990' },
    onProgress: (event) => progress.push(event.type),
    search: async (query, { onChunk }) => {
      calls.push(query);
      if (query.number) {
        onChunk([row('first', { id: '11', number: PHONE, passport: PASSPORT, snils: SNILS,
          fio: 'Иванов Иван', date_of_birth: '01.01.1990', custom: '<unknown & field>' })]);
      } else if (query.passport) {
        onChunk([row('second', { custom: '<unknown & field>', date_of_birth: '01.01.1990',
          fio: 'Иванов Иван', snils: SNILS, passport: PASSPORT, number: PHONE, id: '22' })]);
      } else {
        onChunk([row('first', { id: '11', number: PHONE, passport: PASSPORT, snils: SNILS,
          fio: 'Иванов Иван', date_of_birth: '01.01.1990', custom: '<unknown & field>' })]);
      }
      return metadata(1);
    },
  });
  assert.deepEqual(calls, [{ number: PHONE }, { passport: PASSPORT }, { snils: SNILS }]);
  assert.deepEqual(report.seedQuery, { number: PHONE });
  assert.equal(report.records.length, 1);
  assert.deepEqual(report.records[0].sources, ['first', 'second']);
  assert.deepEqual(report.records[0].queryIds, ['query-1', 'query-2', 'query-3']);
  assert.deepEqual(report.records[0].sourceRecordIds, [{ source: 'first', id: '11' }, { source: 'second', id: '22' }]);
  assert.ok(report.records[0].fields.some(([key, value]) => key === 'custom' && value === '<unknown & field>'));
  assert.ok(report.records[0].fields.some(([key]) => key === 'fio'));
  assert.ok(report.records[0].fields.every(([key]) => key !== 'id'));
  assert.equal(report.stats.duplicates, 2);
  assert.equal(report.stats.pendingQueries, 0);
  assert.equal(report.complete, true);
  assert.equal(progress[0], 'started');
  assert.equal(progress.at(-1), 'finished');
  assert.ok(report.queries.every((query) => query.status === 'completed'));
});

test('initial multiple identifiers search separately instead of restricting hits with an AND request', async () => {
  const calls = [];
  const report = await collectReport({ seedQuery: { number: PHONE, passport: PASSPORT },
    search: async (query) => { calls.push(query); return metadata(); } });
  assert.deepEqual(calls, [{ number: PHONE }, { passport: PASSPORT }]);
  assert.equal(report.complete, true);
});

test('late source metadata updates source details without losing earlier records', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (_query, { onChunk }) => {
    onChunk([row('archive', { number: PHONE, arbitrary: 'value' })]);
    onChunk([{ object_data_base: { name_table: 'archive', name: 'Архив', info: 'Описание', trust: 'high', country: 'RU' } }]);
    return metadata(1);
  } });
  assert.deepEqual(report.sources, [{ id: 'archive', name: 'Архив', info: 'Описание', trust: 'high', country: 'RU' }]);
  assert.deepEqual(report.records[0].sources, ['archive']);
});

test('records with the same phone and different facts remain distinct; technical-only rows keep ids', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (_query, { onChunk }) => {
    onChunk([row('one', { number: PHONE, address: 'A' }), row('one', { number: PHONE, address: 'B' }),
      row('one', { id: '1' }), row('one', { id: '2' })]);
    return metadata(4);
  } });
  assert.equal(report.records.length, 4);
  assert.equal(report.stats.duplicates, 0);
});

test('explicit aliases and recommended identifiers use exact normalization and never guess from arbitrary fields', async () => {
  const calls = [];
  await collectReport({ seedQuery: { phone_number: '+7 (000) 000-00-00' }, search: async (query, { onChunk }) => {
    calls.push(query);
    if (calls.length === 1) {
      onChunk([row('one', { mobile_phone: '+7 (000) 000-00-00', snils: '123-456-789 01',
        passport: '1234 567890', random_number: '123456789012', fio: 'Иванов Иван', date_of_birth: '01.01.1990',
        no_valid_inn: '123456789012' }),
      { object_add_search: { item: [{ key: 'email', value: 'sample@EXAMPLE.TEST' },
        { key: 'fio', value: 'Иванов Иван' }, { key: 'date_of_birth', value: '01.01.1990' },
        { key: 'number', value: '7000%' }, { key: 'inn', value: 'not-an-inn' },
        { key: 'unknown', value: '123456789012' }] } }]);
    }
    return metadata(calls.length === 1 ? 1 : 0);
  } });
  assert.deepEqual(calls, [{ number: PHONE }, { snils: SNILS }, { passport: PASSPORT }, { mail: 'sample@example.test' }]);
});

test('identifier lists are split only at explicit separators and each part validates independently', async () => {
  const calls = [];
  await collectReport({ seedQuery: { number: PHONE }, search: async (query, { onChunk }) => {
    calls.push(query);
    if (calls.length === 1) onChunk([row('one', { number: `${PHONE}; 71111111111 | 7222%`, mail: 'a@example.test,b@example.test' })]);
    return metadata(calls.length === 1 ? 1 : 0);
  } });
  assert.deepEqual(calls, [{ number: PHONE }, { number: '71111111111' }, { mail: 'a@example.test' }, { mail: 'b@example.test' }]);
});

test('shared seed helpers reject FIO, date of birth, masks and free text before any network search', async () => {
  let calls = 0;
  for (const seedQuery of [{ fio: 'Иванов Иван', date_of_birth: '01.01.1990' }, { number: '7000%' },
    { mail: 'sample?@example.test' }, { passport_info: PASSPORT }, {}]) {
    await assert.rejects(collectReport({ seedQuery, search: async () => { calls++; } }), /точный/);
  }
  assert.equal(calls, 0);
  assert.equal(canonicalizeReportIdentifier('number', '+7 (000) 000-00-00'), PHONE);
  assert.equal(canonicalizeReportIdentifier('fio', 'Иванов Иван'), null);
  assert.equal(canonicalizeReportIdentifier('number', '7+0000000000'), null);
  assert.deepEqual(getReportSeedQuery({ phone: PHONE, fio: 'Иванов Иван' }), { number: PHONE });
});

test('invalid optional seed identifiers are disclosed while valid identifiers are searched', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE, inn: '123%' }, search: async () => metadata() });
  assert.deepEqual(report.seedQuery, { number: PHONE });
  assert.ok(report.warnings.some((warning) => warning.includes('inn')));
  assert.equal(report.complete, false);
});

test('unknown and prototype-like field names and source ids are preserved safely', async () => {
  const fields = JSON.parse('{"number":"70000000000","__proto__":"raw","constructor":"value","0":"zero"}');
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (_query, { onChunk }) => {
    onChunk([row('__proto__', fields)]);
    return metadata(1);
  } });
  assert.equal(report.sources[0].id, '__proto__');
  assert.ok(report.records[0].fields.some(([key, value]) => key === '__proto__' && value === 'raw'));
  assert.ok(report.records[0].fields.some(([key, value]) => key === '0' && value === 'zero'));
});

test('query cap stops cycles and reports unvisited identifiers', async () => {
  const calls = [];
  const report = await collectReport({ seedQuery: { number: PHONE }, limits: { maxQueries: 2 },
    search: async (query, { onChunk }) => {
      calls.push(query);
      onChunk([row('one', { number: PHONE, passport: PASSPORT, snils: SNILS })]);
      return metadata(1);
    } });
  assert.equal(calls.length, 2);
  assert.equal(report.stats.pendingQueries, 1);
  assert.equal(report.complete, false);
  assert.ok(report.warnings.some((warning) => warning.includes('лимит запросов: 2')));
});

test('record cap preserves accepted rows and discloses omitted rows instead of silently dropping them', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, limits: { maxRecords: 1 },
    search: async (_query, { onChunk }) => {
      onChunk([row('one', { number: PHONE }), row('two', { number: '71111111111' })]);
      return metadata(2);
    } });
  assert.equal(report.records.length, 1);
  assert.equal(report.complete, false);
  assert.ok(report.warnings.some((warning) => warning.includes('не вошла')));
});

test('server truncation uses exact 64-bit counts and incomplete shards make a partial report', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async () =>
    metadata(1, { total_hits: '9007199254740993', indexed_shards: 2, total_shards: 3 }) });
  assert.equal(report.complete, false);
  assert.equal(report.queries[0].status, 'partial');
  assert.equal(report.queries[0].meta.total_hits, '9007199254740993');
  assert.ok(report.warnings.some((warning) => warning.includes('9007199254740993')));
  assert.ok(report.warnings.some((warning) => warning.includes('частей индекса: 2 из 3')));
});

test('partial server responses do not invent an index update or shard deficit as their cause', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async () =>
    metadata(1, { partial: true, indexed_shards: 3, total_shards: 3 }) });
  assert.equal(report.complete, false);
  assert.equal(report.queries[0].status, 'partial');
  assert.deepEqual(report.warnings, ['Запрос query-1: сервер сообщил о частичной выдаче.']);
  assert.ok(report.warnings.every((warning) => !/обновля|частей индекса/.test(warning)));
});

test('missing server counters never claim confirmed completeness', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async () => ({ meta: {} }) });
  assert.equal(report.complete, false);
  assert.ok(report.warnings.some((warning) => warning.includes('не подтвердил полноту')));
});

test('failed queries keep streamed records and continue with other already discovered identifiers', async () => {
  const calls = [];
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (query, { onChunk }) => {
    calls.push(query);
    if (query.number) {
      onChunk([row('one', { number: PHONE, passport: PASSPORT, snils: SNILS })]);
      throw new Error('connection interrupted');
    }
    return metadata();
  } });
  assert.equal(report.records.length, 1);
  assert.equal(calls.length, 3);
  assert.equal(report.queries[0].status, 'failed');
  assert.equal(report.complete, false);
  assert.ok(report.warnings.some((warning) => warning.includes('connection interrupted')));
});

test('cancellation keeps earlier records, ignores late chunks and never starts another identifier query', async () => {
  let cancelled = false;
  let calls = 0;
  const report = await collectReport({ seedQuery: { number: PHONE }, isCancelled: () => cancelled,
    search: async (_query, { onChunk }) => {
      calls++;
      onChunk([row('one', { number: PHONE, passport: PASSPORT })]);
      cancelled = true;
      onChunk([row('late', { snils: SNILS })]);
      return { meta: { cancelled: true } };
    } });
  assert.equal(calls, 1);
  assert.equal(report.records.length, 1);
  assert.equal(report.cancelled, true);
  assert.equal(report.complete, false);
  assert.equal(report.stats.pendingQueries, 1);
  assert.equal(report.queries[0].status, 'cancelled');
});

test('cancellation before collecting creates a partial report without a search call', async () => {
  let calls = 0;
  const report = await collectReport({ seedQuery: { number: PHONE }, isCancelled: () => true,
    search: async () => { calls++; } });
  assert.equal(calls, 0);
  assert.equal(report.cancelled, true);
  assert.equal(report.complete, false);
});

test('invalid collection limits fail before a search is started', async () => {
  for (const limits of [{ maxQueries: 0 }, { maxQueries: 1.5 }, { maxRecords: -1 }, { maxRecords: '100' }]) {
    await assert.rejects(collectReport({ seedQuery: { number: PHONE }, search: async () => metadata(), limits }), /Лимит/);
  }
});

test('server aggregates preserve values and counts without creating records or follow-up identifier queries', async () => {
  const calls = [];
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (query, { onChunk }) => {
    calls.push(query);
    onChunk([{ object_data_base: { name_table: 'archive', name: 'Архив' } },
      { object_grouped: { key: 'passport', item: [{ value: PASSPORT, count: 4 }, { value: '', count: 0 }] } },
      { object_grouped: { key: 'fio', item: [{ value: 'Иванов Иван', count: 2 }] } }]);
    return metadata();
  } });
  assert.deepEqual(calls, [{ number: PHONE }]);
  assert.equal(report.records.length, 0);
  assert.equal(report.identifiers.length, 1, 'only the seed identifier exists');
  assert.deepEqual(report.aggregates[0], { id: 'aggregate-1', key: 'passport',
    items: [{ value: PASSPORT, count: 4 }, { value: '', count: 0 }], sources: [], queryIds: ['query-1'] });
  assert.deepEqual(report.aggregates[1].items, [{ value: 'Иванов Иван', count: 2 }]);
  assert.equal(report.stats.aggregates, 2);
  assert.equal(report.complete, true);
});

test('identical reordered aggregate groups merge query provenance without summing counts', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE, passport: PASSPORT }, search: async (query, { onChunk }) => {
    const items = [{ value: 'A', count: 3 }, { value: 'B', count: 2 }];
    onChunk([{ object_grouped: { key: 'status', item: query.number ? items : items.toReversed() } }]);
    return metadata();
  } });
  assert.equal(report.aggregates.length, 1);
  assert.deepEqual(report.aggregates[0].items, [{ value: 'A', count: 3 }, { value: 'B', count: 2 }]);
  assert.deepEqual(report.aggregates[0].queryIds, ['query-1', 'query-2']);
  assert.equal(report.stats.aggregateDuplicates, 1);
  assert.equal(report.stats.duplicates, 0, 'record and aggregate duplicates are counted separately');
});

test('different aggregate counters remain separate and arbitrary group keys and duplicate items are preserved', async () => {
  const report = await collectReport({ seedQuery: { number: PHONE }, search: async (_query, { onChunk }) => {
    onChunk([{ object_grouped: { key: '__proto__', item: [{ value: '<raw & value>', count: 1 }] } },
      { object_grouped: { key: '__proto__', item: [{ value: '<raw & value>', count: 2 }] } },
      { object_grouped: { key: 'unknown', item: [{ value: 'same', count: 0 }, { value: 'same', count: 0 }] } },
      { object_grouped: { key: 'empty-group', item: [] } }]);
    return metadata();
  } });
  assert.equal(report.aggregates.length, 4);
  assert.deepEqual(report.aggregates[0].items, [{ value: '<raw & value>', count: 1 }]);
  assert.deepEqual(report.aggregates[1].items, [{ value: '<raw & value>', count: 2 }]);
  assert.equal(report.aggregates[2].items.length, 2);
  assert.deepEqual(report.aggregates[3].items, []);
});

test('failed searches retain aggregate data and cancellation ignores late aggregate chunks', async () => {
  let cancelled = false;
  const retained = await collectReport({ seedQuery: { number: PHONE }, search: async (_query, { onChunk }) => {
    onChunk([{ object_grouped: { key: 'first', item: [{ value: 'received', count: 1 }] } }]);
    throw new Error('stream failed');
  } });
  assert.equal(retained.aggregates.length, 1);
  assert.equal(retained.queries[0].status, 'failed');
  const stopped = await collectReport({ seedQuery: { number: PHONE }, isCancelled: () => cancelled,
    search: async (_query, { onChunk }) => {
      onChunk([{ object_grouped: { key: 'first', item: [{ value: 'received', count: 1 }] } }]);
      cancelled = true;
      onChunk([{ object_grouped: { key: 'late', item: [{ value: 'ignored', count: 1 }] } }]);
      return { meta: { cancelled: true } };
    } });
  assert.equal(stopped.aggregates.length, 1);
  assert.equal(stopped.aggregates[0].key, 'first');
  assert.equal(stopped.cancelled, true);
});
