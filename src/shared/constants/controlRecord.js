export const CONTROL_RECORD_FIELDS = Object.freeze([
  { key: 'date', label: 'Дата', type: 'date' },
  { key: 'number', label: 'Номер', type: 'text', maxLength: 64 },
  { key: 'fio', label: 'ФИО', type: 'text', maxLength: 255 },
  { key: 'date_of_birth', label: 'Дата рождения', type: 'date' },
  { key: 'executor', label: 'Исполнитель', type: 'text', maxLength: 255 },
  { key: 'note', label: 'Примечание', type: 'textarea', maxBytes: 65535 },
  { key: 'realization', label: 'Реализация', type: 'textarea', maxBytes: 65535 },
  { key: 'intersections', label: 'Пересечения', type: 'textarea', maxBytes: 65535 },
].map(Object.freeze));

function validDate(value) {
  if (value === '') return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function normalizeControlValues(values, { create = false } = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Некорректные поля записи.');
  const entries = Object.entries(values);
  if (!create && !entries.length) throw new Error('Укажите хотя бы одно поле записи.');
  const encoder = new TextEncoder();
  for (const [key, value] of entries) {
    const field = CONTROL_RECORD_FIELDS.find(candidate => candidate.key === key);
    if (!field) throw new Error(`Недопустимое поле записи: ${key}.`);
    if (typeof value !== 'string') throw new Error(`Поле «${field.label}» должно содержать текст.`);
    if (field.type === 'date' && !validDate(value)) throw new Error(`Укажите корректную дату в поле «${field.label}».`);
    if (field.maxLength && [...value].length > field.maxLength) throw new Error(`Поле «${field.label}»: не более ${field.maxLength} символов.`);
    if (field.maxBytes && encoder.encode(value).length > field.maxBytes) throw new Error(`Поле «${field.label}» превышает допустимый объём текста (65 535 байт).`);
  }
  return Object.fromEntries(entries);
}
