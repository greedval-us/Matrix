import { getRecordsApi } from '../infrastructure/desktopApi.js';
import { RECORDS_IDENTIFIER_MAX_LENGTH, UNAVAILABLE_RECORDS_CAPABILITIES } from '../../shared/constants/records.js';

function identifier(value, label) {
  const id = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  if (typeof id !== 'string' || !id.trim() || id.length > RECORDS_IDENTIFIER_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(id)) {
    throw new Error(`Некорректный идентификатор ${label}.`);
  }
  return id;
}

function unique(items, key, label) {
  if (new Set(items.map(item => item[key])).size !== items.length) throw new Error(`Повторяющиеся ${label} в ответе сервера.`);
  return items;
}

export function normalizeAttachments(files) {
  if (!Array.isArray(files)) throw new Error('Некорректный список файлов в ответе сервера.');
  return unique(files.map(file => {
    if (!file || typeof file.name !== 'string' || !file.name.trim()) throw new Error('В ответе сервера отсутствует имя файла.');
    return { id: identifier(file.id, 'файла'), name: file.name,
      size: Number.isFinite(file.size) && file.size >= 0 ? file.size : null,
      mimeType: typeof file.mimeType === 'string' ? file.mimeType : '' };
  }), 'id', 'идентификаторы файлов');
}

export function normalizeRecordsPage(result, { pageSize }) {
  if (!result || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total < 0) {
    throw new Error('Сервер вернул некорректную страницу записей.');
  }
  if (result.rows.length > pageSize || result.rows.length > result.total) throw new Error('Некорректное количество записей в ответе сервера.');
  const rows = unique(result.rows.map(row => {
    if (!row?.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new Error('В записи отсутствуют значения столбцов.');
    return { id: identifier(row.id, 'строки'), values: Object.fromEntries(Object.entries(row.values)),
      files: normalizeAttachments(row.files ?? []) };
  }), 'id', 'идентификаторы строк');
  const schema = result.columns ?? [...new Set(rows.flatMap(row => Object.keys(row.values)))].map(key => ({ key }));
  if (!Array.isArray(schema)) throw new Error('Некорректное описание столбцов.');
  const columns = unique(schema.map(column => ({ key: identifier(column?.key, 'столбца'),
    label: typeof column.label === 'string' && column.label.trim() ? column.label : String(column.key),
    type: typeof column.type === 'string' ? column.type : 'text', sortable: column.sortable !== false,
  })), 'key', 'ключи столбцов');
  return { rows, columns, total: result.total };
}

// Client DTOs are independent of the future server protocol.
export class RecordsService {
  constructor({ getApi = getRecordsApi } = {}) { this.getApi = getApi; }

  async getCapabilities() {
    const value = await this.getApi().getCapabilities();
    const available = value?.available === true;
    return { available, ...Object.fromEntries(['list', 'upload', 'download', 'remove'].map(key => [key, available && value[key] === true])),
      message: typeof value?.message === 'string' ? value.message : available ? '' : UNAVAILABLE_RECORDS_CAPABILITIES.message };
  }

  async list(request) { return normalizeRecordsPage(await this.getApi().list(request), request); }

  async uploadFiles(request) {
    const result = await this.getApi().uploadFiles(request);
    if (result?.cancelled === true) return { cancelled: true, files: [] };
    return { cancelled: false, files: normalizeAttachments(result?.files) };
  }

  async downloadFile(request) {
    const result = await this.getApi().downloadFile(request);
    if (result?.cancelled === true) return { cancelled: true, saved: false };
    if (result?.saved !== true) throw new Error('Не удалось сохранить файл.');
    return { cancelled: false, saved: true };
  }

  async removeFile(request) {
    const result = await this.getApi().removeFile(request);
    if (result?.removed !== true) throw new Error('Сервер не подтвердил удаление файла.');
    return result;
  }
}
