import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { RecordsError, safeError } from './recordsErrors.js';
import { fileMetadata, filesMetadata } from './recordsProtocol.js';
import { MEBIBYTE_BYTES, RECORDS_TRANSFER_LIMITS as limits } from './recordsTransferPolicy.js';

/** Validate the whole batch before creating a transport or reading file contents. */
export async function validateUploadFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > limits.maxFiles) throw new RecordsError(`За один раз можно добавить от 1 до ${limits.maxFiles} файлов.`);
  let total = 0;
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.name !== 'string' || !file.name.trim() || !Number.isSafeInteger(file.size) || file.size < 0) throw new RecordsError('Некорректные данные выбранного файла.');
    if (file.size > limits.maxFileBytes) throw new RecordsError(`Размер одного файла не должен превышать ${limits.maxFileBytes / MEBIBYTE_BYTES} МиБ.`);
    total += file.size;
  }
  if (total > limits.maxBatchBytes) throw new RecordsError(`Общий размер выбранных файлов не должен превышать ${limits.maxBatchBytes / MEBIBYTE_BYTES} МиБ.`);
  for (const file of files) {
    let current;
    try { current = await stat(file.path); }
    catch { throw new RecordsError('Не удалось прочитать выбранный файл. Выберите его заново.'); }
    if (!current.isFile() || current.size !== file.size) throw new RecordsError('Выбранный файл изменился. Выберите его заново.');
  }
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

export async function uploadRecordFiles(operation, { rowId, files }) {
  let resolveResponse;
  let rejectResponse;
  const response = new Promise((resolve, reject) => { resolveResponse = resolve; rejectResponse = reject; });
  // Remote failures can precede local IO; retain the failure and interrupt drain waits.
  response.catch(() => {});
  const failed = error => { operation.controller.abort(error); rejectResponse(error); };
  const call = operation.client.uploadFiles(operation.metadataFor('uploadFiles'), operation.options, (error, value) => error ? failed(error) : resolveResponse(value));
  operation.calls.add(call);
  call.on('error', failed);
  for (const file of files) {
    await waitForWrite(call, { header: { row_id: rowId, name: file.name, size: String(file.size), mime_type: '' } }, operation.controller.signal);
    let readBytes = 0;
    for await (const data of createReadStream(file.path, { highWaterMark: limits.chunkBytes, signal: operation.controller.signal })) {
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
}

async function* downloadBytes(iterator, file) {
  let received = 0;
  try {
    for (;;) {
      const frame = await iterator.next();
      if (frame.done) break;
      const data = frame.value.data;
      if (frame.value.file || !Buffer.isBuffer(data) || data.length > limits.chunkBytes) throw new RecordsError('Сервер вернул некорректный ответ потока файла.');
      received += data.length;
      if (received > file.size) throw new RecordsError('Размер скачанного файла не совпадает с метаданными.');
      yield data;
    }
    if (received !== file.size) throw new RecordsError('Размер скачанного файла не совпадает с метаданными.');
  } catch (error) { throw safeError(error); }
}

/** The repository retains operation ownership until this returned stream closes. */
export async function downloadRecordFile(operation, request, payload, finish) {
  const call = operation.client.downloadFile(request, operation.metadataFor('downloadFile'), operation.options);
  operation.calls.add(call);
  const iterator = call[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done || !first.value.file || first.value.data) throw new RecordsError('Сервер не вернул метаданные файла.');
  const file = fileMetadata(first.value.file);
  if (file.id !== payload.fileId) throw new RecordsError('Сервер вернул метаданные другого файла.');
  const source = Readable.from(downloadBytes(iterator, file), { objectMode: false, highWaterMark: limits.chunkBytes });
  operation.source = source;
  const destroyIterator = source._destroy;
  source._destroy = (error, callback) => {
    // Cancel before generator.return(): it may itself be waiting on gRPC.
    finish();
    destroyIterator.call(source, error, callback);
  };
  return { name: file.name, stream: source };
}
