import { getSearchField, MIN_WILDCARD_LITERAL_LENGTH } from '../../shared/constants/searchItems.js'

export class Field {
  constructor(type, value = '', pattern = '') {
    this.type = type
    this.value = value
    this.pattern = pattern
    this.valid = true
    this.placeholder = ''
  }

  sanitize() {
    this.value = String(this.value ?? '')
  }

  validate() {
    if (!this.value || !this.pattern) {
      this.valid = true
    } else if (this.value.includes('?') || this.value.includes('%')) {
      const literalLength = this.value.replace(/[?%]/g, '').length
      const allowedCharacters = getSearchField(this.type)?.wildcardPattern
      this.valid = literalLength >= MIN_WILDCARD_LITERAL_LENGTH && (!allowedCharacters || allowedCharacters.test(this.value))
    } else {
      this.valid = new RegExp(this.pattern).test(this.value)
    }
    return this.valid
  }

  setValue(val) {
    this.value = String(val ?? '')
    this.sanitize()
    this.validate()
  }
}
