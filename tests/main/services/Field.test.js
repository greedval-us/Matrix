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

test('the descriptor registry preserves every supported literal field mask', () => {
  const examples = {
    fio: ['Иванов Иван', '123'], date_of_birth: ['31.12.1990', '32.12.1990'],
    number: ['79001234567', '+79001234567'], mail: ['person@example.test', 'person@'],
    passport: ['1234567890', '123'], inn: ['123456789', '12345678'],
    snils: ['12345678901', '1234567890'], telegram: ['12345', '1234'],
    vk: ['12345', '1234'], facebook: ['name.123', 'abc'],
    imei: ['123456789012345', '12345678901234'], imsi: ['12345678901234', '1234567890123'],
    grz: ['A123BC', 'Z123BC'], vin: ['XTA210990Y2765432', 'ITA210990Y2765432'],
  }
  for (const [type, [valid, invalid]] of Object.entries(examples)) {
    assert.equal(field(type, valid).valid, true, type + ' literal value')
    assert.equal(field(type, invalid).valid, false, type + ' invalid value')
    assert.equal(field(type, '').valid, true, type + ' empty value')
  }
})
