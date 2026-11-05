import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createRecordFingerprint,
  ResultParser,
} from '../../../src/renderer/utils/ResultParser.js'

test('result parser removes the service id field', () => {
  const parser = new ResultParser()
  const result = parser.parse({
    object_data: {
      source_name: 'vtb_2022',
      fields: { id: '42', number: '79000000000', fio: 'Иванов Иван' },
    },
  })

  assert.deepEqual(result.fields, [
    ['number', '79000000000'],
    ['fio', 'Иванов Иван'],
  ])
})

test('record fingerprints ignore field order but preserve every value difference', () => {
  const first = createRecordFingerprint([
    ['number', '79000000000'],
    ['fio', 'Иванов Иван'],
  ])
  const reordered = createRecordFingerprint([
    ['fio', 'Иванов Иван'],
    ['number', '79000000000'],
  ])
  const changed = createRecordFingerprint([
    ['number', '79000000000'],
    ['fio', 'Иванов  Иван'],
  ])

  assert.equal(first, reordered)
  assert.notEqual(first, changed)
})
