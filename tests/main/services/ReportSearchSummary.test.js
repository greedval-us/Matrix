import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReportSearchSummary } from '../../../src/renderer/utils/reportSearchSummary.js';

test('groups every observed phone alias and keeps unique values in encounter order', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [
    { fields: [['phone', '+7 (900) 000-00-01'], ['email', 'first@EXAMPLE.COM'],
      ['number', '79000000001'], ['work_phone', ' 79000000002 ']] },
    { fields: [['home_phone', '07900000003'], ['mobile_phone', '79000000004'],
      ['phone_work', '79000000002']] },
  ] }), [
    { field: 'number', values: ['79000000001', '79000000002', '07900000003', '79000000004'] },
    { field: 'mail', values: ['first@example.com'] },
  ]);
});

test('includes every supported search type, including FIO and birth dates excluded from recursive collection', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['vk_id', '0000012345'], ['fio', 'Иванов Иван Иванович'], ['date_of_birth', '01.02.1990'],
    ['passport_number', '0123 456789'], ['inn', '0123456789'], ['snils', '012-345-678 90'],
    ['telegram_id', '0000012346'], ['facebook_id', 'Example.User'], ['imei', '012345678901234'],
    ['imsi', '01234567890123'], ['actual_grz', 'a123bc'], ['vin', 'xta210990y2765432'],
  ] }] }), [
    { field: 'vk', values: ['0000012345'] },
    { field: 'fio', values: ['Иванов Иван Иванович'] },
    { field: 'date_of_birth', values: ['01.02.1990'] },
    { field: 'passport', values: ['0123456789'] },
    { field: 'inn', values: ['0123456789'] },
    { field: 'snils', values: ['01234567890'] },
    { field: 'telegram', values: ['0000012346'] },
    { field: 'facebook', values: ['Example.User'] },
    { field: 'imei', values: ['012345678901234'] },
    { field: 'imsi', values: ['01234567890123'] },
    { field: 'grz', values: ['A123BC'] },
    { field: 'vin', values: ['XTA210990Y2765432'] },
  ]);
});

test('recognizes readable search and translation labels without promoting arbitrary notes', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['ФИО', '  Иванов Иван  '], ['Телефон', '+7 (900) 000-00-01'],
    ['Номер телефона', '79000000002'], ['Дата рождения', '01.01.1990'],
    ['Email', 'a@EXAMPLE.COM'], ['Паспорт', '0123 456789'],
    ['ID ВК', '12345'], ['VIN номер', 'xta210990y2765432'],
    ['Город', 'Москва'], ['notes', '79000000003'], ['unknown', 'other@example.com'],
  ] }] }), [
    { field: 'fio', values: ['Иванов Иван'] },
    { field: 'number', values: ['79000000001', '79000000002'] },
    { field: 'date_of_birth', values: ['01.01.1990'] },
    { field: 'mail', values: ['a@example.com'] },
    { field: 'passport', values: ['0123456789'] },
    { field: 'vk', values: ['12345'] },
    { field: 'vin', values: ['XTA210990Y2765432'] },
  ]);
});

test('keeps all explicitly listed phones and splits whitespace only when each token is a complete identifier', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['number', '79990000001 79990000002 79990000003'],
    ['phone', '+7 (999) 000-00-01'],
    ['number', '79990000004; 79990000005 | 79990000006\n79990000007,79990000008'],
    ['phone', '7900000 0001 7900000 0002'],
  ] }] }), [{ field: 'number', values: [
    '79990000001', '79990000002', '79990000003', '79990000004',
    '79990000005', '79990000006', '79990000007', '79990000008',
    '7900000 0001 7900000 0002',
  ] }]);
});

test('retains formatted single phones as one normalized value', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['phone', '+7 (900) 000-00-01'], ['number', '79000000001'],
    ['home_phone', '0 (900) 000-00-02'],
  ] }] }), [{ field: 'number', values: ['79000000001', '09000000002'] }]);
});

test('preserves person-name commas and spaces and splits FIO and dates only on explicit list boundaries', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['fio', 'Иванов, Иван Иванович; Петров Петр | Сидоров Сидор\nИванов, Иван Иванович'],
    ['date_of_birth', '01.01.1990; 02.02.1991\n03.03.1992, 04.04.1993'],
  ] }] }), [
    { field: 'fio', values: ['Иванов, Иван Иванович', 'Петров Петр', 'Сидоров Сидор'] },
    { field: 'date_of_birth', values: ['01.01.1990', '02.02.1991', '03.03.1992, 04.04.1993'] },
  ]);
});

test('keeps nonempty known-field text even when identifier normalization rejects it', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['email_address', 'USER@EXAMPLE.COM; not an email'], ['pasport_numb', '  паспорт утрачен  '],
    ['number', '  unknown phone  '], ['mail', 'USER@example.com'],
  ] }] }), [
    { field: 'mail', values: ['USER@example.com', 'not an email'] },
    { field: 'passport', values: ['паспорт утрачен'] },
    { field: 'number', values: ['unknown phone'] },
  ]);
});

test('preserves a valid whole email containing list punctuation before considering explicit email lists', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [{ fields: [
    ['mail', 'foo|bar@EXAMPLE.COM'], ['email', 'last,first@example.com'],
    ['e_mail', 'foo;bar@example.com'], ['mail', 'first@example.com;second@example.com'],
  ] }] }), [{ field: 'mail', values: [
    'foo|bar@example.com', 'last,first@example.com', 'foo;bar@example.com',
    'first@example.com', 'second@example.com',
  ] }]);
});

test('omits empty values, structured values and unsupported fields', () => {
  assert.deepEqual(buildReportSearchSummary({ records: [null, {}, { fields: null }, { fields: [
    ['number', null], ['number', undefined], ['number', ' \t '], ['number', {}],
    ['number', ['79000000001']], ['mail', false], ['unknown', 0], ['passport', 1234567890],
    ['__proto__', '79000000002'], null, ['fio'],
  ] }] }), [{ field: 'passport', values: ['1234567890'] }]);
  assert.deepEqual(buildReportSearchSummary(), []);
  assert.deepEqual(buildReportSearchSummary(null), []);
});

test('omits requested seeds unless returned records, aggregates or identifier sources prove they were found', () => {
  assert.deepEqual(buildReportSearchSummary({
    seedQuery: { phone: '+7 (900) 000-00-01', email: 'a@EXAMPLE.COM' },
    identifiers: [
      { field: 'number', value: '79000000001', sources: [] },
      { field: 'mail', value: 'a@example.com' },
    ],
    queries: [{ query: { number: '79000000001' }, status: 'completed' }],
  }), []);
  assert.deepEqual(buildReportSearchSummary({ seedQuery: { number: '79000000001' } }), []);
});

test('includes sourced identifiers and source-less non-seed search suggestions', () => {
  assert.deepEqual(buildReportSearchSummary({
    seedQuery: { number: '+7 (900) 000-00-01', passport: '0123 456789' },
    identifiers: [
      { field: 'number', value: '79000000001', sources: ['first'] },
      { field: 'passport', value: '0123456789', sources: [] },
      { field: 'email', value: 'new@EXAMPLE.COM', sources: [] },
      { field: 'phone', value: '79000000002', sources: [] },
      { field: 'mail', value: 'new@example.com', sources: [] },
      { field: 'passport_number', value: '0012 345678', sources: ['second'] },
    ],
  }), [
    { field: 'number', values: ['79000000001', '79000000002'] },
    { field: 'mail', values: ['new@example.com'] },
    { field: 'passport', values: ['0012345678'] },
  ]);
});

test('retains seed-equivalent values observed in records even when their identifier has no source', () => {
  assert.deepEqual(buildReportSearchSummary({
    seedQuery: { number: '79000000001' },
    records: [{ fields: [['phone', '+7 (900) 000-00-01']] }],
    identifiers: [{ field: 'number', value: '79000000001', sources: [] }],
  }), [{ field: 'number', values: ['79000000001'] }]);
});

test('adds recognized aggregate items as found values even with zero counts and no source', () => {
  assert.deepEqual(buildReportSearchSummary({
    seedQuery: { number: '79000000001' },
    identifiers: [{ field: 'number', value: '79000000001', sources: [] }],
    aggregates: [
      { key: 'Телефон', items: [{ value: '+7 (900) 000-00-01', count: 0 },
        { value: '79000000002 | 79000000003', count: 5 }] },
      { key: 'ФИО', items: [{ value: 'Иванов Иван', count: 1 }] },
      { key: 'Дата рождения', items: [{ value: '01.01.1990', count: 1 }] },
      { key: 'email', items: [{ value: 'a@EXAMPLE.COM', count: 1 }] },
      { key: 'note', items: [{ value: '79000000004', count: 1 }] },
    ],
  }), [
    { field: 'number', values: ['79000000001', '79000000002', '79000000003'] },
    { field: 'fio', values: ['Иванов Иван'] },
    { field: 'date_of_birth', values: ['01.01.1990'] },
    { field: 'mail', values: ['a@example.com'] },
  ]);
});

test('leaves frozen report DTOs unchanged and returns independent summary arrays', () => {
  const report = Object.freeze({
    seedQuery: Object.freeze({ number: '79000000001' }),
    records: Object.freeze([Object.freeze({ fields: Object.freeze([
      Object.freeze(['number', '+7 (900) 000-00-01']),
      Object.freeze(['fio', 'Иванов Иван']),
      Object.freeze(['notes', Object.freeze({ text: 'raw' })]),
    ]), sources: Object.freeze(['first']) })]),
    identifiers: Object.freeze([Object.freeze({ field: 'mail', value: 'a@EXAMPLE.COM', sources: Object.freeze([]) })]),
    aggregates: Object.freeze([Object.freeze({ key: 'number', items: Object.freeze([
      Object.freeze({ value: '79000000002', count: 1 }),
    ]) })]),
  });
  const original = structuredClone(report);
  const summary = buildReportSearchSummary(report);
  assert.deepEqual(summary, [
    { field: 'number', values: ['79000000001', '79000000002'] },
    { field: 'fio', values: ['Иванов Иван'] },
    { field: 'mail', values: ['a@example.com'] },
  ]);
  summary[0].values.push('changed');
  assert.deepEqual(report, original);
});
