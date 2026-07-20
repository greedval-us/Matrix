export class Field {
  constructor(type, value = '', pattern = '') {
    this.type = type
    this.value = value
    this.pattern = pattern
    this.valid = true
    this.placeholder = ''
  }

  sanitize() {
    this.value = this.sanitizeStart(this.type, this.value)
  }

  sanitizeStart(type, value) {
    if (type === 'date_of_birth') {
      let v = value.replace(/[^0-9.?%]+/g, '').slice(0, 10)
      if (v.length > 2 && v[2] !== '.') v = v.slice(0, 2) + '.' + v.slice(2)
      if (v.length > 5 && v[5] !== '.') v = v.slice(0, 5) + '.' + v.slice(5)
      return v
    }
  
    const digitsOnly = value.replace(/[^0-9?%]+/g, '')
    const defaultSanitized = value.replace(/[^a-zA-Zа-яА-Я0-9?%]+/g, '')
  
    if (['telegram', 'vk', 'facebook'].includes(type)) return digitsOnly
    if (type === 'number') return digitsOnly.slice(0, 15)
    if (type === 'snils') return digitsOnly.slice(0, 11)
    if (type === 'passport') return digitsOnly.slice(0, 10)
    if (type === 'inn') return digitsOnly.slice(0, 12)
    if (type === 'grz') return value.replace(/[^ABEKMHOPCTYX0-9?%]+/gi, '').slice(0, 9)
    if (type === 'vin') return value.replace(/[^a-zA-Z0-9?%]+/g, '').slice(0, 17)
    if (type === 'fio') return value.replace(/[^a-zA-Zа-яА-ЯёЁ ?%]+/g, '').slice(0, 255)
    if (type === 'mail') {
      let val = value.slice(0, 255)
      const parts = val.split('@')
      if (parts.length > 2) return parts.slice(0, 2).join('@')
      if (parts.length === 2) {
        const [before, after] = parts
        if (before.includes('*')) return before.replace(/\*/g, '')
        const starIndex = after.indexOf('*')
        if (starIndex >= 0) return `${before}@${after.slice(0, starIndex + 1)}`
        return `${before}@${after}`
      }
      return val.replace(/\*/g, '')
    }
  
    return defaultSanitized
  }

  validate() {
    if (this.value.includes('?') || this.value.includes('%')) {
      this.valid = true
    } else if (!this.pattern) {
      this.valid = true
    } else {
      const regex = new RegExp(this.pattern)
      this.valid = regex.test(this.value)
    }
    return this.valid
  }

  setValue(val) {
    this.value = val
    this.sanitize()
    this.validate()
  }
}
