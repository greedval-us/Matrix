import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from '../../../src/shared/constants/controlRecord.js';

test('the shared editable field policy exposes all nine fields and copies string values', () => {
  assert.deepEqual(policy.CONTROL_RECORD_FIELDS.map(field => field.key), ['date', 'number', 'fio', 'date_of_birth', 'initiator', 'executor', 'note', 'realization', 'intersections']);
  const input = { date: '2024-02-29', initiator: 'Инициатор', note: '  текст\n' };
  assert.deepEqual(policy.normalizeControlValues(input), input);
  assert.notEqual(policy.normalizeControlValues(input), input);
  assert.deepEqual(policy.normalizeControlValues({}, { create: true }), {});
  assert.throws(() => policy.normalizeControlValues({}), /поле/);
});

test('field policy rejects reserved keys, wrong types and impossible calendar dates', () => {
  for (const input of [{ id: '1' }, { files: '' }, { unknown: '' }, { note: 1 }, { note: null }, [], null]) {
    assert.throws(() => policy.normalizeControlValues(input));
  }
  for (const date of ['2025-02-29', '2024-04-31', '2024-13-01', '0000-01-01', '0999-12-31', '2024-1-01']) {
    assert.throws(() => policy.normalizeControlValues({ date }), /дат/);
    assert.throws(() => policy.normalizeControlValues({ date_of_birth: date }), /дат/);
  }
  assert.deepEqual(policy.normalizeControlValues({ date: '', date_of_birth: '2000-02-29' }), { date: '', date_of_birth: '2000-02-29' });
});

test('field limits count Unicode characters and UTF-8 TEXT bytes rather than UTF-16 units', () => {
  assert.equal(policy.normalizeControlValues({ number: '😀'.repeat(64) }).number.length, 128);
  assert.throws(() => policy.normalizeControlValues({ number: '😀'.repeat(65) }));
  for (const key of ['fio', 'initiator', 'executor']) {
    assert.equal(policy.normalizeControlValues({ [key]: 'я'.repeat(255) })[key].length, 255);
    assert.throws(() => policy.normalizeControlValues({ [key]: 'я'.repeat(256) }));
  }
  for (const key of ['note', 'realization', 'intersections']) {
    assert.equal(policy.normalizeControlValues({ [key]: 'я'.repeat(32767) })[key].length, 32767);
    assert.throws(() => policy.normalizeControlValues({ [key]: 'я'.repeat(32768) }));
  }
});
