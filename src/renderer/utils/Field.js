const wildcardCharacterPatterns = Object.freeze({
  fio: /^[A-Za-zА-Яа-яЁё\s?%-]+$/,
  date_of_birth: /^[0-9.?%]+$/,
  number: /^[0-9?%]+$/,
  mail: /^\S+$/,
  passport: /^[0-9?%]+$/,
  inn: /^[0-9?%]+$/,
  snils: /^[0-9?%]+$/,
  telegram: /^[0-9?%]+$/,
  vk: /^[0-9?%]+$/,
  facebook: /^[A-Za-z0-9.?%]+$/,
  imei: /^[0-9?%]+$/,
  imsi: /^[0-9?%]+$/,
  grz: /^[ABEKMHOPCTYXАВЕКМНОРСТУХ0-9?%]+$/i,
  vin: /^[A-HJ-NPR-Z0-9?%]+$/i,
})

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
      const allowedCharacters = wildcardCharacterPatterns[this.type]
      this.valid = literalLength >= 3 && (!allowedCharacters || allowedCharacters.test(this.value))
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
