import { key as translations } from '../../shared/constants/translateKey'

export function normalizeKey(rawKey) {
  if (!rawKey) return ''
  return String(rawKey)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
}

export function translate(rawKey) {
  const norm = normalizeKey(rawKey)
  return translations[norm] || rawKey
}
