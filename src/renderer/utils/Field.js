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
    this.valid = true
    return this.valid
  }

  setValue(val) {
    this.value = String(val ?? '')
    this.sanitize()
    this.validate()
  }
}
