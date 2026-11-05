import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { grpc, loadProto } from '../../utils/grpcLoader.js';
import { RECORDS_IDENTIFIER_MAX_LENGTH } from '../../../shared/constants/records.js';

const CHUNK_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20;
const FILE_TIMEOUT_MS = 120000;
const UNAVAILABLE_MESSAGE = 'Раздел «Записи» недоступен. Проверьте подключение и поддержку этого раздела сервером.';

class RecordsError extends Error {}
class ConfigurationError extends RecordsError {}

function safeError(error) {
  if (error instanceof RecordsError) return error;
  const messages = {
    [grpc.status.UNAUTHENTICATED]: 'Сервер отклонил API-ключ.',
    [grpc.status.PERMISSION_DENIED]: 'Недостаточно прав для операции с записями.',
    [grpc.status.UNAVAILABLE]: 'Сервер записей недоступен.',
    [grpc.status.UNIMPLEMENTED]: 'Сервер не поддерживает раздел «Записи».',
    [grpc.status.NOT_FOUND]: 'Запись или файл не найдены.',
    [grpc.status.INVALID_ARGUMENT]: 'Сервер отклонил данные записи или файла.',
    [grpc.status.RESOURCE_EXHAUSTED]: 'Превышен лимит файлов или сервер занят.',
    [grpc.status.DEADLINE_EXCEEDED]: 'Истекло время ожидания ответа сервера записей.',
    [grpc.status.CANCELLED]: 'Операция с записями отменена.',
    [grpc.status.FAILED_PRECONDITION]: 'Операция недоступна для текущего состояния записи.',
  };
  return new RecordsError(messages[error?.code] || 'Не удалось выполнить операцию с записями. Повторите попытку.');
}

function identifier(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > RECORDS_IDENTIFIER_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new RecordsError('Сервер вернул некорректный идентификатор записи или файла.');
  }
  return value;
}

function safeInteger(value) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value))) throw new RecordsError('Сервер вернул некорректное число в ответе.');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new RecordsError('Сервер вернул некорректное число в ответе.');
  return number;
}

function fileMetadata(file) {
  if (!file || typeof file.name !== 'string' || !file.name.trim() || /[\u0000-\u001f\u007f]/.test(file.name)) throw new RecordsError('Сервер вернул некорректные метаданные файла.');
  const size = safeInteger(file.size);
  if (size > MAX_FILE_BYTES) throw new RecordsError('Сервер вернул недопустимый размер файла.');
  return { id: identifier(file.id), name: file.name, size, mimeType: typeof file.mime_type === 'string' ? file.mime_type : '' };
}

function filesMetadata(files) {
  if (!Array.isArray(files)) throw new RecordsError('Сервер вернул некорректный ответ о файлах.');
  const result = files.map(fileMetadata);
  if (new Set(result.map(file => file.id)).size !== result.length) throw new RecordsError('Сервер вернул повторяющиеся идентификаторы файлов.');
  return result;
}

function recordMetadata(row) {
  if (!row?.values || typeof row.values !== 'object' || Array.isArray(row.values)) throw new RecordsError('Сервер вернул некорректную запись.');
  return { id: identifier(row.id), values: { ...row.values }, files: filesMetadata(row.files ?? []) };
}

function reference({ rowId, fileId }) { return { row_id: identifier(rowId), file_id: identifier(fileId) }; }

function unavailable() {
  return { available: false, list: false, upload: false, download: false, remove: false, create: false, update: false, delete: false, message: UNAVAILABLE_MESSAGE };
}

function waitForWrite(call, frame, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const cleanup = () => { call.removeListener('drain', drained); signal.removeEventListener('abort', aborted); };
    const drained = () => { cleanup(); resolve(); };
    const aborted = () => { cleanup(); reject(signal.reason); };
    call.once('drain', drained);
    signal.addEventListener('abort', aborted, { once: true });
    try { if (call.write(frame)) drained(); }
    catch (error) { cleanup(); reject(error); }
  });
}

/** Authenticated main-only adapter; one transport per operation follows current settings. */
export class GrpcRecordsRepository {
  constructor({ connectionService, dependencies = {} }) {
    this.connectionService = connectionService;
    this.grpc = dependencies.grpc || grpc;
    this.loadProto = dependencies.loadProto || loadProto;
    this.operations = new Set();
    this.closed = false;
  }

  async open(fileOperation = false) {
    if (this.closed) throw new RecordsError('Клиент записей закрыт.');
    let config;
    try { config = await this.connectionService.getResolvedConfig(); }
    catch { throw new ConfigurationError('Проверьте настройки подключения к серверу записей.'); }
    if (this.closed) throw new RecordsError('Клиент записей закрыт.');
    const credentials = this.grpc.credentials.createSsl(config.caCertificate);
    const options = { 'grpc.max_receive_message_length': 32 * 1024 * 1024 };
    if (config.tlsServerName) {
      options['grpc.ssl_target_name_override'] = config.tlsServerName;
      options['grpc.default_authority'] = config.tlsServerName;
    }
    const Client = this.loadProto('records.proto').matrix.records.v1.Records;
    const metadata = new this.grpc.Metadata();
    metadata.set('x-api-key', config.apiKey);
    const operation = { client: new Client(config.endpoint, credentials, options), metadata,
      options: { deadline: new Date(Date.now() + Math.max(config.connectionTimeoutMs, fileOperation ? FILE_TIMEOUT_MS : 0)) },
      calls: new Set(), controller: new AbortController(), source: null };
    this.operations.add(operation);
    return operation;
  }

  finish(operation) {
    if (!this.operations.delete(operation)) return;
    operation.controller.abort(new RecordsError('Операция с записями отменена.'));
    operation.source?.destroy();
    for (const call of operation.calls) call.cancel();
    operation.client.close();
  }

  unary(operation, method, request) {
    return new Promise((resolve, reject) => {
      const call = operation.client[method](request, operation.metadata, operation.options, (error, response) => error ? reject(error) : resolve(response));
      operation.calls.add(call);
    });
  }

  async execute(callback, fileOperation = false) {
    let operation;
    try { operation = await this.open(fileOperation); return await callback(operation); }
    catch (error) { throw safeError(error); }
    finally { if (operation) this.finish(operation); }
  }

  async getCapabilities() {
    let operation;
    try {
      operation = await this.open();
      const result = await this.unary(operation, 'getCapabilities', {});
      const available = result?.available === true;
      return { available, list: available && result.list === true, upload: available && result.upload === true,
        download: available && result.download === true, remove: available && result.remove === true,
        create: available && result.create === true, update: available && result.update === true, delete: available && result.delete === true,
        message: available ? '' : UNAVAILABLE_MESSAGE };
    } catch (error) {
      if (error instanceof ConfigurationError || [this.grpc.status.UNIMPLEMENTED, this.grpc.status.UNAVAILABLE].includes(error?.code)) return unavailable();
      throw safeError(error);
    } finally { if (operation) this.finish(operation); }
  }

  async list({ query, sort, page, pageSize }) {
    return this.execute(async operation => {
      const result = await this.unary(operation, 'listRecords', { query, sort_key: sort?.key || '', sort_direction: sort?.direction || '', page, page_size: pageSize });
      if (!Array.isArray(result?.columns) || !Array.isArray(result?.rows)) throw new RecordsError('Сервер вернул некорректный ответ таблицы.');
      return { columns: result.columns.map(column => ({ key: identifier(column.key), label: column.label, type: column.type, sortable: column.sortable === true })),
        rows: result.rows.map(row => ({ id: identifier(row.id), values: { ...row.values }, files: filesMetadata(row.files) })), total: safeInteger(result.total) };
    });
  }

  async createRecord({ values }) {
    return this.execute(async operation => recordMetadata(await this.unary(operation, 'createRecord', { values })));
  }

  async updateRecord({ rowId, values }) {
    return this.execute(async operation => recordMetadata(await this.unary(operation, 'updateRecord', { id: identifier(rowId), values })));
  }

  async deleteRecord({ rowId }) {
    return this.execute(async operation => {
      let result;
      try { result = await this.unary(operation, 'deleteRecord', { id: identifier(rowId) }); }
      catch (error) {
        if (error?.code === this.grpc.status.FAILED_PRECONDITION) throw new RecordsError('Сначала удалите все вложения записи.');
        throw error;
      }
      if (result?.deleted !== true) throw new RecordsError('Сервер не подтвердил удаление записи.');
      return { deleted: true };
    });
  }

  async uploadFiles({ rowId, files }) {
    identifier(rowId);
    if (!Array.isArray(files) || !files.length || files.length > MAX_FILES) throw new RecordsError('За один раз можно добавить от 1 до 20 файлов.');
    let total = 0;
    for (const file of files) {
      if (!file || typeof file.path !== 'string' || typeof file.name !== 'string' || !file.name.trim() || !Number.isSafeInteger(file.size) || file.size < 0) throw new RecordsError('Некорректные данные выбранного файла.');
      if (file.size > MAX_FILE_BYTES) throw new RecordsError('Размер одного файла не должен превышать 25 МиБ.');
      total += file.size;
    }
    if (total > MAX_BATCH_BYTES) throw new RecordsError('Общий размер выбранных файлов не должен превышать 100 МиБ.');
    for (const file of files) {
      let current;
      try { current = await stat(file.path); }
      catch { throw new RecordsError('Не удалось прочитать выбранный файл. Выберите его заново.'); }
      if (!current.isFile() || current.size !== file.size) throw new RecordsError('Выбранный файл изменился. Выберите его заново.');
    }
    return this.execute(async operation => {
      let resolveResponse;
      let rejectResponse;
      const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
      // Remote failures may arrive before local IO has finished; retain the failure
      // without an unhandled rejection and interrupt any backpressure wait.
      response.catch(() => {});
      const failed = error => { operation.controller.abort(error); rejectResponse(error); };
      const call = operation.client.uploadFiles(operation.metadata, operation.options, (error, value) => error ? failed(error) : resolveResponse(value));
      operation.calls.add(call);
      call.on('error', failed);
      for (const file of files) {
        await waitForWrite(call, { header: { row_id: rowId, name: file.name, size: String(file.size), mime_type: '' } }, operation.controller.signal);
        let readBytes = 0;
        for await (const data of createReadStream(file.path, { highWaterMark: CHUNK_BYTES, signal: operation.controller.signal })) {
          readBytes += data.length;
          if (readBytes > file.size) throw new RecordsError('Выбранный файл изменился во время загрузки.');
          await waitForWrite(call, { data }, operation.controller.signal);
        }
        if (readBytes !== file.size) throw new RecordsError('Выбранный файл изменился во время загрузки.');
      }
      call.end();
      const confirmed = filesMetadata((await response)?.files);
      if (confirmed.length !== files.length || confirmed.some((file, index) => file.name !== files[index].name || file.size !== files[index].size)) throw new RecordsError('Сервер не подтвердил загрузку всех выбранных файлов.');
      return { files: confirmed };
    }, true);
  }

  async downloadFile(payload) {
    const request = reference(payload);
    let operation;
    try {
      operation = await this.open(true);
      const call = operation.client.downloadFile(request, operation.metadata, operation.options);
      operation.calls.add(call);
      const iterator = call[Symbol.asyncIterator]();
      const first = await iterator.next();
      if (first.done || !first.value.file || first.value.data) throw new RecordsError('Сервер не вернул метаданные файла.');
      const file = fileMetadata(first.value.file);
      if (file.id !== payload.fileId) throw new RecordsError('Сервер вернул метаданные другого файла.');
      const bytes = async function* () {
        let received = 0;
        try {
          for (;;) {
            const frame = await iterator.next();
            if (frame.done) break;
            const data = frame.value.data;
            if (frame.value.file || !Buffer.isBuffer(data) || data.length > CHUNK_BYTES) throw new RecordsError('Сервер вернул некорректный ответ потока файла.');
            received += data.length;
            if (received > file.size) throw new RecordsError('Размер скачанного файла не совпадает с метаданными.');
            yield data;
          }
          if (received !== file.size) throw new RecordsError('Размер скачанного файла не совпадает с метаданными.');
        } catch (error) { throw safeError(error); }
      };
      const source = Readable.from(bytes(), { objectMode: false, highWaterMark: CHUNK_BYTES });
      operation.source = source;
      const destroyIterator = source._destroy;
      source._destroy = (error, callback) => {
        // Readable.from waits for generator.return(), which can itself be waiting
        // on gRPC. Cancel first, including before any bytes have been requested.
        this.finish(operation);
        destroyIterator.call(source, error, callback);
      };
      return { name: file.name, stream: source };
    } catch (error) {
      if (operation) this.finish(operation);
      throw safeError(error);
    }
  }

  async removeFile(payload) {
    const request = reference(payload);
    return this.execute(async operation => {
      const result = await this.unary(operation, 'removeFile', request);
      if (result?.deleted !== true) throw new RecordsError('Сервер не подтвердил удаление файла.');
      return { removed: true };
    });
  }

  shutdown() {
    this.closed = true;
    for (const operation of this.operations) this.finish(operation);
  }
}
