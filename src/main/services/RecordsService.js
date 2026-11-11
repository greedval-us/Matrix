import electron from 'electron';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  RECORDS_PAGE_SIZES, DEFAULT_RECORDS_PAGE_SIZE,
  RECORDS_QUERY_MAX_LENGTH, RECORDS_IDENTIFIER_MAX_LENGTH,
} from '../../shared/constants/records.js';
import { UnavailableRecordsRepository } from './records/UnavailableRecordsRepository.js';
import { normalizeControlValues } from '../../shared/constants/controlRecord.js';
import { normalizeRecordsCapabilities } from '../../shared/recordsCapabilities.js';
import { selectRecordUploadFiles, saveRecordDownload } from './records/recordsLocalFiles.js';

function identifier(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > RECORDS_IDENTIFIER_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Некорректный идентификатор ${label}`);
  }
  return value;
}

function rowReference(payload) {
  return { rowId: identifier(payload?.rowId, 'строки') };
}

function fileReference(payload) {
  return { ...rowReference(payload), fileId: identifier(payload?.fileId, 'файла') };
}

function listRequest(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Некорректный запрос таблицы');
  const { query = '', page = 1, pageSize = DEFAULT_RECORDS_PAGE_SIZE, sort = null } = payload;
  if (typeof query !== 'string' || query.length > RECORDS_QUERY_MAX_LENGTH) throw new Error('Некорректная строка поиска');
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('Некорректная страница');
  if (!RECORDS_PAGE_SIZES.includes(pageSize)) throw new Error('Некорректное количество строк на странице');
  let sorting = null;
  if (sort !== null) {
    if (!sort || typeof sort !== 'object' || !['asc', 'desc'].includes(sort.direction)) throw new Error('Некорректная сортировка');
    sorting = { key: identifier(sort.key, 'столбца'), direction: sort.direction };
  }
  return { query, page, pageSize, sort: sorting };
}

function fileMetadata(file) {
  const metadata = { id: identifier(file?.id, 'файла'), name: String(file?.name || 'Файл') };
  if (Number.isSafeInteger(file?.size) && file.size >= 0) metadata.size = file.size;
  if (typeof file?.mimeType === 'string') metadata.mimeType = file.mimeType;
  return metadata;
}

function recordMetadata(row) {
  if (!row?.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new Error('Сервер вернул некорректную запись');
  return { id: identifier(row.id, 'строки'), values: Object.fromEntries(Object.entries(row.values)), files: (row.files ?? []).map(fileMetadata) };
}

/** Main-only adapter. Repository upload paths and download streams never cross IPC. */
export class RecordsService {
  constructor({ repository = new UnavailableRecordsRepository(), dialog = electron.dialog, fileSystem = fs, createId = randomUUID } = {}) {
    this.repository = repository;
    this.dialog = dialog;
    this.fileSystem = fileSystem;
    this.createId = createId;
  }

  async getCapabilities() {
    return normalizeRecordsCapabilities(await this.repository.getCapabilities());
  }

  async requireCapability(capability) {
    const capabilities = await this.getCapabilities();
    if (!capabilities[capability]) throw new Error(capabilities.message || 'Операция недоступна для этого подключения');
  }

  async list(payload) {
    const request = listRequest(payload);
    await this.requireCapability('list');
    return this.repository.list(request);
  }

  async createRecord(payload) {
    const values = normalizeControlValues(payload?.values, { create: true });
    await this.requireCapability('create');
    return recordMetadata(await this.repository.createRecord({ values }));
  }

  async updateRecord(payload) {
    const reference = rowReference(payload);
    const values = normalizeControlValues(payload?.values);
    await this.requireCapability('update');
    return recordMetadata(await this.repository.updateRecord({ ...reference, values }));
  }

  async deleteRecord(payload) {
    const reference = rowReference(payload);
    await this.requireCapability('delete');
    const result = await this.repository.deleteRecord(reference);
    if (result?.deleted !== true) throw new Error('Сервер не подтвердил удаление записи');
    return { deleted: true };
  }

  async uploadFiles(payload) {
    const reference = rowReference(payload);
    await this.requireCapability('upload');
    const files = await selectRecordUploadFiles({ dialog: this.dialog, fileSystem: this.fileSystem });
    if (!files) return { cancelled: true, files: [] };
    const result = await this.repository.uploadFiles({ ...reference, files });
    return { cancelled: false, files: (result.files || []).map(fileMetadata) };
  }

  async downloadFile(payload) {
    const reference = fileReference(payload);
    await this.requireCapability('download');
    const download = await this.repository.downloadFile(reference);
    return saveRecordDownload(download, { dialog: this.dialog, fileSystem: this.fileSystem, createId: () => this.createId() });
  }

  async removeFile(payload) {
    const reference = fileReference(payload);
    await this.requireCapability('remove');
    await this.repository.removeFile(reference);
    return { removed: true };
  }

  async shutdown() { await this.repository.shutdown?.(); }
}
