import electron from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import {
  RECORDS_PAGE_SIZES, DEFAULT_RECORDS_PAGE_SIZE,
  RECORDS_QUERY_MAX_LENGTH, RECORDS_IDENTIFIER_MAX_LENGTH,
} from '../../shared/constants/records.js';
import { UnavailableRecordsRepository, RECORDS_UNAVAILABLE_MESSAGE } from './records/UnavailableRecordsRepository.js';

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

function suggestedFilename(value) {
  // A remote name is display data, never a path. Handle both slash conventions
  // even if this client is later packaged for a different operating system.
  const basename = path.posix.basename(path.win32.basename(String(value || 'Файл')));
  const sanitized = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  return sanitized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized) ? sanitized : 'Файл';
}

async function closeSource(source) {
  if (typeof source?.destroy === 'function') source.destroy();
  else if (typeof source?.return === 'function') await source.return();
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
    const value = await this.repository.getCapabilities();
    const available = value?.available === true;
    return {
      available,
      list: available && value.list === true,
      upload: available && value.upload === true,
      download: available && value.download === true,
      remove: available && value.remove === true,
      message: typeof value?.message === 'string' ? value.message : (available ? '' : RECORDS_UNAVAILABLE_MESSAGE),
    };
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

  async uploadFiles(payload) {
    const reference = rowReference(payload);
    await this.requireCapability('upload');
    const selection = await this.dialog.showOpenDialog({ title: 'Добавить файлы к записи', properties: ['openFile', 'multiSelections'] });
    if (selection.canceled || !selection.filePaths?.length) return { cancelled: true, files: [] };
    const files = await Promise.all(selection.filePaths.map(async (filePath) => {
      const stat = await this.fileSystem.stat(filePath);
      if (!stat.isFile()) throw new Error('Для загрузки можно выбрать только файлы');
      return { path: filePath, name: path.basename(filePath), size: stat.size };
    }));
    const result = await this.repository.uploadFiles({ ...reference, files });
    return { cancelled: false, files: (result.files || []).map(fileMetadata) };
  }

  async downloadFile(payload) {
    const reference = fileReference(payload);
    await this.requireCapability('download');
    const download = await this.repository.downloadFile(reference);
    const source = download?.stream;
    let sourceError;
    const rememberError = (error) => { sourceError = error; };
    source?.on?.('error', rememberError);
    let temporaryPath;
    let ownedTemporary = false;
    let handle;
    let failed = false;
    let primaryError;
    try {
      if (!source || typeof source[Symbol.asyncIterator] !== 'function') throw new Error('Сервер не вернул поток файла');
      const selection = await this.dialog.showSaveDialog({ title: 'Сохранить файл', defaultPath: suggestedFilename(download.name) });
      if (selection.canceled) return { cancelled: true, saved: false };
      if (typeof selection.filePath !== 'string' || !path.isAbsolute(selection.filePath) || selection.filePath.includes('\0')) {
        throw new Error('Не удалось выбрать путь для сохранения');
      }
      if (sourceError) throw sourceError;
      temporaryPath = path.join(path.dirname(selection.filePath), `.${path.basename(selection.filePath)}.${this.createId()}.part`);
      handle = await this.fileSystem.open(temporaryPath, 'wx');
      ownedTemporary = true;
      // pipeline propagates failures and applies backpressure without loading
      // the entire file into renderer or main memory.
      await pipeline(source, handle.createWriteStream());
      await this.fileSystem.rename(temporaryPath, selection.filePath);
      ownedTemporary = false;
      return { cancelled: false, saved: true };
    } catch (error) {
      failed = true;
      primaryError = error;
      throw error;
    } finally {
      const cleanupErrors = [];
      // Close handles before unlinking on Windows, but attempt each cleanup even
      // when a preceding one fails. The transfer failure remains the main error.
      for (const cleanup of [
        () => handle?.close(),
        () => closeSource(source),
        () => source?.removeListener?.('error', rememberError),
        () => ownedTemporary ? this.fileSystem.unlink(temporaryPath) : undefined,
      ]) {
        try { await cleanup(); }
        catch (error) { cleanupErrors.push(error); }
      }
      if (cleanupErrors.length) {
        if (failed) {
          // Keep the original error identity/message for IPC and logging. Some
          // adapters may throw frozen or primitive errors; those still win.
          try { Object.defineProperty(primaryError, 'cleanupErrors', { value: cleanupErrors, configurable: true }); }
          catch {}
        } else {
          throw new AggregateError(cleanupErrors, cleanupErrors[0]?.message || 'Не удалось завершить работу с файлом', { cause: cleanupErrors[0] });
        }
      }
    }
  }

  async removeFile(payload) {
    const reference = fileReference(payload);
    await this.requireCapability('remove');
    await this.repository.removeFile(reference);
    return { removed: true };
  }
}
