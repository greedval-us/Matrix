import { RECORDS_IDENTIFIER_MAX_LENGTH } from '../../../shared/constants/records.js';
import { RecordsError } from './recordsErrors.js';
import { RECORDS_TRANSFER_LIMITS } from './recordsTransferPolicy.js';

export const RECORDS_SERVER_UNAVAILABLE_MESSAGE = 'Раздел «Записи» недоступен. Проверьте подключение и поддержку этого раздела сервером.';

export function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > RECORDS_IDENTIFIER_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RecordsError('Сервер вернул некорректный идентификатор записи или файла.');
  }
  return value;
}

export function safeInteger(value) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new RecordsError('Сервер вернул некорректное число в ответе.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new RecordsError('Сервер вернул некорректное число в ответе.');
  return number;
}

export function fileMetadata(file) {
  if (!file || typeof file.name !== 'string' || !file.name.trim() || /[\u0000-\u001f\u007f]/.test(file.name)) throw new RecordsError('Сервер вернул некорректные метаданные файла.');
  const size = safeInteger(file.size);
  if (size > RECORDS_TRANSFER_LIMITS.maxFileBytes) throw new RecordsError('Сервер вернул недопустимый размер файла.');
  return { id: identifier(file.id), name: file.name, size, mimeType: typeof file.mime_type === 'string' ? file.mime_type : '' };
}

export function filesMetadata(files) {
  if (!Array.isArray(files)) throw new RecordsError('Сервер вернул некорректный ответ о файлах.');
  const result = files.map(fileMetadata);
  if (new Set(result.map(file => file.id)).size !== result.length) throw new RecordsError('Сервер вернул повторяющиеся идентификаторы файлов.');
  return result;
}

export function recordMetadata(row) {
  if (!row?.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new RecordsError('Сервер вернул некорректную запись.');
  return { id: identifier(row.id), values: { ...row.values }, files: filesMetadata(row.files ?? []) };
}

export function fileReference({ rowId, fileId }) {
  return { row_id: identifier(rowId), file_id: identifier(fileId) };
}

export function capabilitiesMetadata(value) {
  const available = value?.available === true;
  return { available, list: available && value.list === true, upload: available && value.upload === true,
    download: available && value.download === true, remove: available && value.remove === true,
    create: available && value.create === true, update: available && value.update === true, delete: available && value.delete === true,
    message: available ? '' : RECORDS_SERVER_UNAVAILABLE_MESSAGE };
}

export function listMetadata(result) {
  if (!Array.isArray(result?.columns) || !Array.isArray(result?.rows)) throw new RecordsError('Сервер вернул некорректный ответ таблицы.');
  return { columns: result.columns.map(column => ({ key: identifier(column.key), label: column.label, type: column.type, sortable: column.sortable === true })),
    rows: result.rows.map(row => ({ id: identifier(row.id), values: { ...row.values }, files: filesMetadata(row.files) })), total: safeInteger(result.total) };
}
