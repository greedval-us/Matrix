import test from 'node:test'
import assert from 'node:assert/strict'
import { Field } from '../../../src/renderer/utils/Field.js'
import { defaultPatterns, defaultPlaceholders } from '../../../src/shared/constants/searchItems.js'

function field(type, value) {
  const result = new Field(type, '', defaultPatterns[type])
  result.setValue(value)
  return result
}

test('fixed-format search fields highlight invalid values', () => {
  assert.equal(field('number', '123').valid, false)
  assert.equal(field('number', '79001234567').valid, true)
  assert.equal(field('number', '380501234567').valid, true)
  assert.equal(field('number', '12025550123').valid, true)
  assert.equal(defaultPlaceholders.number, '8-15 цифр без +, пробелов и скобок')
  assert.equal(field('passport', '123456789').valid, false)
  assert.equal(field('passport', '1234567890').valid, true)
  assert.equal(field('mail', 'wrong-address').valid, false)
  assert.equal(field('mail', 'name@example.com').valid, true)
})

test('wildcard searches remain valid for fixed-format fields', () => {
  assert.equal(field('number', '7900%').valid, true)
  assert.equal(field('passport', '12????7890').valid, true)
  assert.equal(field('number', 'abc%').valid, false)
  assert.equal(field('number', '%').valid, false)
})
