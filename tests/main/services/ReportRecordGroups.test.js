import assert from 'node:assert/strict';
import test from 'node:test';
import { groupReportRecords } from '../../../src/renderer/utils/reportRecordGroups.js';

test('keeps each name with the phone from its own record', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['first'] },
    { fields: [['fio', 'Б'], ['number', '70000000002']], sources: ['second'] },
  ]), [
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['first'] },
    { fields: [['fio', 'Б'], ['number', '70000000002']], sources: ['second'] },
  ]);
});

test('does not infer identity from a shared name, phone or subset of fields', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['fio', 'А'], ['date_of_birth', '01.01.1990']], sources: ['birth-one'] },
    { fields: [['fio', 'А'], ['date_of_birth', '02.02.1991']], sources: ['birth-two'] },
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['phone-one'] },
    { fields: [['fio', 'Б'], ['number', '70000000001']], sources: ['phone-two'] },
    { fields: [['number', '70000000001']], sources: ['phone-only'] },
    { fields: [['fio', 'А']], sources: ['name-only'] },
  ]), [
    { fields: [['fio', 'А'], ['date_of_birth', '01.01.1990']], sources: ['birth-one'] },
    { fields: [['fio', 'А'], ['date_of_birth', '02.02.1991']], sources: ['birth-two'] },
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['phone-one'] },
    { fields: [['fio', 'Б'], ['number', '70000000001']], sources: ['phone-two'] },
    { fields: [['number', '70000000001']], sources: ['phone-only'] },
    { fields: [['fio', 'А']], sources: ['name-only'] },
  ]);
});

test('merges only complete duplicate bundles regardless of field order and retains their own sources', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['number', '70000000001'], ['fio', 'А'], ['fio', 'А'], ['empty', ' ']],
      sources: ['first', 'first', null, '', ' ', 7] },
    { fields: [['fio', 'Б'], ['number', '70000000002']], sources: ['unrelated'] },
    { fields: [['fio', 'А'], ['number', '70000000001'], ['empty', null]],
      sources: [7, 'second', undefined, 'first'] },
  ]), [
    { fields: [['number', '70000000001'], ['fio', 'А']], sources: ['first', '7', 'second'] },
    { fields: [['fio', 'Б'], ['number', '70000000002']], sources: ['unrelated'] },
  ]);
});

test('preserves multi-valued names and phones as whole text without inventing pairings', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['fio', 'А; Б'], ['number', '70000000001 | 70000000002']], sources: ['mixed'] },
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['single'] },
  ]), [
    { fields: [['fio', 'А; Б'], ['number', '70000000001 | 70000000002']], sources: ['mixed'] },
    { fields: [['fio', 'А'], ['number', '70000000001']], sources: ['single'] },
  ]);
});

test('omits blank fields and empty records while preserving zero, false, unknown fields and original whitespace', () => {
  assert.deepEqual(groupReportRecords([
    null,
    {},
    { fields: null },
    { fields: [] },
    { fields: [['a', ''], ['b', ' \t\n'], ['c', null], ['d', undefined]], sources: ['empty'] },
    { fields: [['unknown', 0], ['active', false], ['__proto__', '  raw \n'], ['object', {}], ['list', []]],
      sources: [0, false] },
  ]), [
    { fields: [['unknown', 0], ['active', false], ['__proto__', '  raw \n'], ['object', {}], ['list', []]],
      sources: ['0', 'false'] },
  ]);
  assert.deepEqual(groupReportRecords(), []);
  assert.deepEqual(groupReportRecords(null), []);
});

test('keeps different value types distinct and canonicalizes object keys without reordering arrays', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['unknown', 0]], sources: ['number'] },
    { fields: [['unknown', '0']], sources: ['string'] },
    { fields: [['unknown', false]], sources: ['boolean'] },
    { fields: [['unknown', 'false']], sources: ['boolean-text'] },
    { fields: [['unknown', { z: [1, '2'], a: { y: false, x: 0 } }]], sources: ['object-one'] },
    { fields: [['unknown', { a: { x: 0, y: false }, z: [1, '2'] }]], sources: ['object-two'] },
    { fields: [['unknown', { a: { x: 0, y: false }, z: ['2', 1] }]], sources: ['reversed-array'] },
    { fields: [['unknown', [0]]], sources: ['array'] },
    { fields: [['unknown', { 0: 0 }]], sources: ['numeric-object-key'] },
  ]), [
    { fields: [['unknown', 0]], sources: ['number'] },
    { fields: [['unknown', '0']], sources: ['string'] },
    { fields: [['unknown', false]], sources: ['boolean'] },
    { fields: [['unknown', 'false']], sources: ['boolean-text'] },
    { fields: [['unknown', { z: [1, '2'], a: { y: false, x: 0 } }]], sources: ['object-one', 'object-two'] },
    { fields: [['unknown', { a: { x: 0, y: false }, z: ['2', 1] }]], sources: ['reversed-array'] },
    { fields: [['unknown', [0]]], sources: ['array'] },
    { fields: [['unknown', { 0: 0 }]], sources: ['numeric-object-key'] },
  ]);
});

test('removes duplicate pairs within one record while retaining distinct values of the same field', () => {
  assert.deepEqual(groupReportRecords([
    { fields: [['fio', 'А'], ['fio', 'Б'], ['unknown', { a: 1, b: 2 }], ['fio', 'А'],
      ['unknown', { b: 2, a: 1 }]], sources: ['first'] },
    { fields: [['unknown', { b: 2, a: 1 }], ['fio', 'Б'], ['fio', 'А']], sources: ['second'] },
  ]), [
    { fields: [['fio', 'А'], ['fio', 'Б'], ['unknown', { a: 1, b: 2 }]], sources: ['first', 'second'] },
  ]);
});

test('leaves the raw report records and their field order unchanged', () => {
  const firstFields = Object.freeze([
    Object.freeze(['number', '70000000001']),
    Object.freeze(['fio', 'А']),
    Object.freeze(['fio', 'А']),
    Object.freeze(['unknown', Object.freeze({ z: 1, a: Object.freeze([false, 0]) })]),
  ]);
  const records = Object.freeze([
    Object.freeze({ fields: firstFields, sources: Object.freeze(['first', 'first']) }),
    Object.freeze({ fields: Object.freeze([Object.freeze(['fio', 'А'])]), sources: Object.freeze(['second']) }),
  ]);
  const original = structuredClone(records);
  const groups = groupReportRecords(records);
  assert.deepEqual(records, original);
  assert.equal(groups.length, 2);
  assert.notEqual(groups[0].fields, firstFields);
  assert.notEqual(groups[0].fields[0], firstFields[0]);
  assert.deepEqual(groups[0].sources, ['first']);
});
