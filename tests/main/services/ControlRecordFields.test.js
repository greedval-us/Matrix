import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../../../src/shared/constants/controlRecord.js';

test('the shared editable field policy exposes Telegram ID and one text birth date', () => {
  assert.deepEqual(policy.CONTROL_RECORD_FIELDS.map(field => field.key), [
    'date', 'source_id', 'number', 'fio', 'date_of_birth', 'group_chat_locality',
    'initiator', 'executor', 'location', 'note', 'realization', 'intersections',
  ]);
  assert.equal(policy.CONTROL_RECORD_FIELDS.find(field => field.key === 'source_id').label, 'Telegram ID');
  assert.equal(policy.CONTROL_RECORD_FIELDS.find(field => field.key === 'date_of_birth').type, 'textarea');
  const input = {
    date: '2024-02-29', source_id: '000123', date_of_birth: ' 1986 г.\nдата уточняется ', group_chat_locality: 'Группа',
    initiator: 'Инициатор', note: '  текст\n',
  };
  assert.deepEqual(policy.normalizeControlValues(input), input);
  assert.notEqual(policy.normalizeControlValues(input), input);
  assert.deepEqual(policy.normalizeControlValues({}, { create: true }), {});
  assert.throws(() => policy.normalizeControlValues({}), /поле/);
});

test('control locations are fixed choices and column filters are validated separately', () => {
  assert.deepEqual(policy.CONTROL_LOCATIONS, ['В РФ', 'Выехал из РФ', 'Неизвестно']);
  for (const location of policy.CONTROL_LOCATIONS) {
    assert.deepEqual(policy.normalizeControlValues({ location }), { location });
  }
  assert.throws(() => policy.normalizeControlValues({ location: '' }));
  assert.throws(() => policy.normalizeControlValues({ location: 'Другой статус' }));
  assert.deepEqual(policy.normalizeControlFilters({ id: ' 01 ', date: '2024-02-29', location: 'В РФ', note: '%_=', executor: ' ' }),
    { id: '01', date: '2024-02-29', location: 'В РФ', note: '%_=' });
  for (const filters of [{ files: 'x' }, { date: '2025-02-29' }, { location: 'РФ' }, { executor: 1 }]) {
    assert.throws(() => policy.normalizeControlFilters(filters));
  }
});

test('field policy rejects reserved keys, wrong types and impossible record dates', () => {
  for (const input of [{ id: '1' }, { files: '' }, { unknown: '' }, { birth_date_text: '' }, { note: 1 }, { note: null }, [], null]) {
    assert.throws(() => policy.normalizeControlValues(input));
  }
  for (const date of ['2025-02-29', '2024-04-31', '2024-13-01', '0000-01-01', '0999-12-31', '2024-1-01']) {
    assert.throws(() => policy.normalizeControlValues({ date }), /дат/);
  }
  assert.deepEqual(policy.normalizeControlValues({ date: '', date_of_birth: '2000-02-29' }), { date: '', date_of_birth: '2000-02-29' });
});

test('field limits count Unicode characters and UTF-8 TEXT bytes rather than UTF-16 units', () => {
  assert.equal(policy.normalizeControlValues({ number: '😀'.repeat(64) }).number.length, 128);
  assert.throws(() => policy.normalizeControlValues({ number: '😀'.repeat(65) }));
  for (const key of ['source_id', 'fio', 'group_chat_locality', 'initiator', 'executor']) {
    assert.equal(policy.normalizeControlValues({ [key]: 'я'.repeat(255) })[key].length, 255);
    assert.throws(() => policy.normalizeControlValues({ [key]: 'я'.repeat(256) }));
  }
  for (const key of ['date_of_birth', 'note', 'realization', 'intersections']) {
    assert.equal(policy.normalizeControlValues({ [key]: 'я'.repeat(32767) })[key].length, 32767);
    assert.throws(() => policy.normalizeControlValues({ [key]: 'я'.repeat(32768) }));
  }
});
