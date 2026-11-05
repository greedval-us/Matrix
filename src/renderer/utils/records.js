const BYTE_UNIT = 1024;
const FILE_SIZE_UNITS = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
const numberFormatter = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function getRecordValue(row, key) {
  return Object.hasOwn(row.values, key) ? row.values[key] : null;
}

export function formatRecordValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (typeof value === 'object') {
    try { return JSON.stringify(value); }
    catch { return 'Не удалось отобразить значение'; }
  }
  return String(value);
}

export function formatAttachmentSize(size) {
  if (!Number.isFinite(size) || size < 0) return 'Размер неизвестен';
  const unit = size === 0 ? 0 : Math.min(Math.floor(Math.log(size) / Math.log(BYTE_UNIT)), FILE_SIZE_UNITS.length - 1);
  return `${numberFormatter.format(size / BYTE_UNIT ** Math.max(0, unit))} ${FILE_SIZE_UNITS[Math.max(0, unit)]}`;
}

export const attachmentOperationKey = (rowId, fileId) => JSON.stringify([rowId, fileId]);
