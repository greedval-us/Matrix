import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Readable, Writable } from 'node:stream';
import { RecordsService } from '../../../src/main/services/RecordsService.js';
import { RecordsHandler, assertRecordsSender } from '../../../src/main/ipc/RecordsHandler.js';
import { IPC_CHANNELS } from '../../../src/shared/constants/ipcChannels.js';
import { RECORDS_QUERY_MAX_LENGTH, RECORDS_IDENTIFIER_MAX_LENGTH, RECORDS_UNAVAILABLE_MESSAGE } from '../../../src/shared/constants/records.js';

const capabilities = { available: true, list: true, upload: true, download: true, remove: true, message: '' };
const reference = { rowId: 'row-1', fileId: 'file-1' };

function repository(overrides = {}) {
  return { getCapabilities: async () => capabilities, ...overrides };
}

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'matrix-records-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('records remain explicitly unavailable without a server adapter and never open local dialogs', async () => {
  const service = new RecordsService({ dialog: {} });
  assert.deepEqual(await service.getCapabilities(), {
    available: false, list: false, upload: false, download: false, remove: false,
    message: RECORDS_UNAVAILABLE_MESSAGE,
  });
  await assert.rejects(service.list(), /серверного API/);
  await assert.rejects(service.uploadFiles(reference), /серверного API/);
  await assert.rejects(service.downloadFile(reference), /серверного API/);
  await assert.rejects(service.removeFile(reference), /серверного API/);
});

test('records capabilities cannot enable operations while the adapter is unavailable', async () => {
  const service = new RecordsService({ repository: repository({ getCapabilities: async () => ({ ...capabilities, available: false }) }) });
  const result = await service.getCapabilities();
  assert.equal(result.list, false);
  assert.equal(result.upload, false);
  assert.equal(result.download, false);
  assert.equal(result.remove, false);
});

test('records list forwards dynamic sort keys and a bounded page request without renderer extra properties', async () => {
  const requests = [];
  const response = { columns: [{ key: 'Поле базы', label: 'Поле базы' }], rows: [], total: 0 };
  const service = new RecordsService({ repository: repository({ list: async (request) => { requests.push(request); return response; } }) });
  assert.equal(await service.list({ query: 'Иван', page: 2, pageSize: 50, sort: { key: 'Поле базы', direction: 'desc' }, localPath: 'ignored' }), response);
  await service.list();
  assert.deepEqual(requests, [
    { query: 'Иван', page: 2, pageSize: 50, sort: { key: 'Поле базы', direction: 'desc' } },
    { query: '', page: 1, pageSize: 25, sort: null },
  ]);
});

test('records reject malformed pagination, sorting, search and identities before reaching the adapter', async () => {
  const service = new RecordsService({ repository: { getCapabilities() { throw new Error('unexpected adapter call'); } } });
  const invalidQueries = [
    null, [], { query: 123 }, { query: 'x'.repeat(RECORDS_QUERY_MAX_LENGTH + 1) },
    { page: 0 }, { page: 1.2 }, { page: Number.MAX_SAFE_INTEGER + 1 }, { pageSize: 26 },
    { sort: {} }, { sort: { key: 'a', direction: 'ascending' } }, { sort: { key: '', direction: 'asc' } },
  ];
  for (const request of invalidQueries) await assert.rejects(service.list(request), /Некоррект/);
  for (const rowId of ['', '  ', 123, 'a\0b', 'x'.repeat(RECORDS_IDENTIFIER_MAX_LENGTH + 1)]) {
    await assert.rejects(service.uploadFiles({ rowId }), /идентификатор строки/);
  }
  await assert.rejects(service.downloadFile({ rowId: 'valid', fileId: null }), /идентификатор файла/);
  await assert.rejects(service.removeFile({ rowId: 'valid', fileId: '\n' }), /идентификатор файла/);
});

test('cancelled file selection performs no upload and does not apply a TXT extension filter', async () => {
  let options;
  const service = new RecordsService({
    repository: repository({ uploadFiles() { assert.fail('upload must not run'); } }),
    dialog: { showOpenDialog: async (value) => { options = value; return { canceled: true, filePaths: [] }; } },
  });
  assert.deepEqual(await service.uploadFiles(reference), { cancelled: true, files: [] });
  assert.deepEqual(options.properties, ['openFile', 'multiSelections']);
  assert.equal('filters' in options, false);
});

test('arbitrary attachment types are uploaded from native selections and local paths never return to renderer', async (t) => {
  const directory = await temporaryDirectory(t);
  const selected = [path.join(directory, 'документ.pdf'), path.join(directory, 'архив.zip')];
  await writeFile(selected[0], Buffer.from([0, 255, 17]));
  await writeFile(selected[1], Buffer.from([7, 0]));
  let received;
  const service = new RecordsService({
    repository: repository({ uploadFiles: async (payload) => {
      received = payload;
      return { files: [{ id: 'remote-1', name: 'документ.pdf', size: 3, mimeType: 'application/pdf', path: selected[0] }] };
    } }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: selected }) },
  });
  const result = await service.uploadFiles({ rowId: 'row-1', path: 'renderer-path-is-ignored' });
  assert.deepEqual(received, { rowId: 'row-1', files: [
    { path: selected[0], name: 'документ.pdf', size: 3 }, { path: selected[1], name: 'архив.zip', size: 2 },
  ] });
  assert.deepEqual(result, { cancelled: false, files: [{ id: 'remote-1', name: 'документ.pdf', size: 3, mimeType: 'application/pdf' }] });
});

test('a selected directory or missing file fails before any upload starts', async (t) => {
  const directory = await temporaryDirectory(t);
  let uploads = 0;
  const service = new RecordsService({
    repository: repository({ uploadFiles: async () => { uploads++; } }),
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [directory] }) },
  });
  await assert.rejects(service.uploadFiles(reference), /только файлы/);
  service.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(directory, 'missing')] });
  await assert.rejects(service.uploadFiles(reference), { code: 'ENOENT' });
  assert.equal(uploads, 0);
});

test('download cancellation closes the remote stream, sanitizes its default filename and writes nothing', async () => {
  const stream = Readable.from([Buffer.from([0, 255])]);
  let options;
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: '..\\../folder/secret.pdf', stream }) }),
    dialog: { showSaveDialog: async (value) => { options = value; return { canceled: true }; } },
    fileSystem: { open() { assert.fail('must not create a cancelled download'); } },
  });
  assert.deepEqual(await service.downloadFile(reference), { cancelled: true, saved: false });
  assert.equal(stream.destroyed, true);
  assert.equal(options.defaultPath, 'secret.pdf');
});

test('download cancellation returns an async iterator without requesting file bytes', async () => {
  let closed = false;
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() { assert.fail('cancelled selection must not request bytes'); },
    async return() { closed = true; return { done: true }; },
  };
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'file.bin', stream }) }),
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
  });
  assert.deepEqual(await service.downloadFile(reference), { cancelled: true, saved: false });
  assert.equal(closed, true);
});

test('a remote stream error while the save dialog is open is caught before creating a local file', async () => {
  const stream = new Readable({ read() {} });
  const failure = new Error('remote failed during selection');
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'file.bin', stream }) }),
    dialog: { showSaveDialog: async () => {
      stream.destroy(failure);
      await new Promise((resolve) => setImmediate(resolve));
      return { canceled: false, filePath: path.resolve('unused.bin') };
    } },
    fileSystem: { open() { assert.fail('must not create a file for a failed remote stream'); } },
  });
  await assert.rejects(service.downloadFile(reference), failure);
});

test('binary download streams into a unique file and replaces the chosen destination only after success', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = path.join(directory, 'result.bin');
  await writeFile(destination, 'existing file');
  const chunks = [Buffer.from([0, 255, 128]), Buffer.from([9, 0])];
  let received;
  const service = new RecordsService({
    repository: repository({ downloadFile: async (payload) => { received = payload; return { name: 'result.bin', stream: Readable.from(chunks) }; } }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
  });
  assert.deepEqual(await service.downloadFile({ ...reference, filePath: 'ignored' }), { cancelled: false, saved: true });
  assert.deepEqual(received, reference);
  assert.deepEqual(await readFile(destination), Buffer.concat(chunks));
  assert.deepEqual(await readdir(directory), ['result.bin']);
});

test('an async iterable can supply download bytes without buffering an entire attachment', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = path.join(directory, 'iterable.bin');
  async function* bytes() { yield Buffer.from([0, 1]); yield Buffer.from([255]); }
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'iterable.bin', stream: bytes() }) }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
  });
  await service.downloadFile(reference);
  assert.deepEqual(await readFile(destination), Buffer.from([0, 1, 255]));
});

test('failed transfer cleans its own temporary file while preserving an existing destination', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = path.join(directory, 'result.bin');
  await writeFile(destination, 'keep existing');
  async function* failingBytes() { yield Buffer.from([0, 1]); throw new Error('remote stream failed'); }
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'result.bin', stream: failingBytes() }) }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
  });
  await assert.rejects(service.downloadFile(reference), /remote stream failed/);
  assert.equal(await readFile(destination, 'utf8'), 'keep existing');
  assert.deepEqual(await readdir(directory), ['result.bin']);
});

test('failed handle close and unlink are both attempted without replacing the original transfer error', async () => {
  const original = new Error('original remote failure');
  const closeFailure = new Error('handle close failed');
  const unlinkFailure = new Error('temporary unlink failed');
  const cleanupCalls = [];
  async function* failingBytes() { yield Buffer.from([1]); throw original; }
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'file.bin', stream: failingBytes() }) }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: path.resolve('file.bin') }) },
    fileSystem: {
      open: async () => ({
        createWriteStream: () => new Writable({ write(_chunk, _encoding, callback) { callback(); } }),
        close: async () => { cleanupCalls.push('close'); throw closeFailure; },
      }),
      unlink: async () => { cleanupCalls.push('unlink'); throw unlinkFailure; },
    },
  });
  await assert.rejects(service.downloadFile(reference), error => {
    assert.equal(error, original);
    assert.deepEqual(error.cleanupErrors, [closeFailure, unlinkFailure]);
    return true;
  });
  assert.deepEqual(cleanupCalls, ['close', 'unlink']);
});

test('a failed source close preserves the save-dialog error and still removes its error listener', async () => {
  const original = new Error('native save failed');
  const closeFailure = new Error('remote source close failed');
  const cleanupCalls = [];
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() { assert.fail('dialog failure must not request file bytes'); },
    on() {},
    async return() { cleanupCalls.push('source'); throw closeFailure; },
    removeListener() { cleanupCalls.push('listener'); },
  };
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'file.bin', stream }) }),
    dialog: { showSaveDialog: async () => { throw original; } },
  });
  await assert.rejects(service.downloadFile(reference), error => {
    assert.equal(error, original);
    assert.deepEqual(error.cleanupErrors, [closeFailure]);
    return true;
  });
  assert.deepEqual(cleanupCalls, ['source', 'listener']);
});

test('a cleanup failure with no preceding transfer failure is reported instead of silently ignored', async () => {
  const closeFailure = new Error('remote cancellation failed');
  const stream = {
    [Symbol.asyncIterator]() { return this; },
    next() { assert.fail('cancelled dialog must not request file bytes'); },
    async return() { throw closeFailure; },
  };
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'file.bin', stream }) }),
    dialog: { showSaveDialog: async () => ({ canceled: true }) },
  });
  await assert.rejects(service.downloadFile(reference), error => {
    assert.ok(error instanceof AggregateError);
    assert.equal(error.cause, closeFailure);
    assert.deepEqual(error.errors, [closeFailure]);
    return true;
  });
});

test('failed rename cleans the completed temporary file and preserves the original destination', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = path.join(directory, 'result.bin');
  await writeFile(destination, 'keep existing');
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'result.bin', stream: Readable.from([Buffer.from([255])]) }) }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
    fileSystem: { ...fs, rename: async () => { throw new Error('rename refused'); } },
  });
  await assert.rejects(service.downloadFile(reference), /rename refused/);
  assert.equal(await readFile(destination, 'utf8'), 'keep existing');
  assert.deepEqual(await readdir(directory), ['result.bin']);
});

test('exclusive creation never removes a temporary file the service did not create', async (t) => {
  const directory = await temporaryDirectory(t);
  const destination = path.join(directory, 'result.bin');
  const collision = path.join(directory, '.result.bin.collision.part');
  await writeFile(collision, 'belongs to another operation');
  const stream = Readable.from([Buffer.from([1])]);
  const service = new RecordsService({
    repository: repository({ downloadFile: async () => ({ name: 'result.bin', stream }) }),
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
    createId: () => 'collision',
  });
  await assert.rejects(service.downloadFile(reference), { code: 'EEXIST' });
  assert.equal(await readFile(collision, 'utf8'), 'belongs to another operation');
  assert.equal(stream.destroyed, true);
});

test('remove forwards only remote row and file IDs and never interprets them as filesystem paths', async () => {
  const calls = [];
  const service = new RecordsService({
    repository: repository({ removeFile: async (payload) => calls.push(payload) }),
    fileSystem: { unlink() { assert.fail('remote deletion must never delete a local file'); } },
  });
  const remoteIds = { rowId: '../remote-row', fileId: 'C:\\remote-file-id' };
  assert.deepEqual(await service.removeFile({ ...remoteIds, path: 'C:\\secret.txt' }), { removed: true });
  assert.deepEqual(calls, [remoteIds]);
});

test('records IPC accepts the app main frame and explicit development origin, rejecting foreign frames and origins', () => {
  const filePath = path.resolve('build/renderer/index.html');
  const frame = { url: `${pathToFileURL(filePath).href}#/records` };
  const event = { sender: { mainFrame: frame }, senderFrame: frame };
  assert.doesNotThrow(() => assertRecordsSender(event, { filePath, devServerUrl: false }));
  assert.throws(() => assertRecordsSender({ ...event, senderFrame: { ...frame } }, { filePath }), /Недопустимый/);
  frame.url = 'https://attacker.invalid/index.html';
  assert.throws(() => assertRecordsSender(event, { filePath, devServerUrl: 'http://localhost:5173' }), /Недопустимый/);
  frame.url = 'http://localhost:5173/#/records';
  assert.doesNotThrow(() => assertRecordsSender(event, { filePath, devServerUrl: 'http://localhost:5173' }));
  frame.url = 'http://localhost:5173.attacker.invalid/';
  assert.throws(() => assertRecordsSender(event, { filePath, devServerUrl: 'http://localhost:5173' }), /Недопустимый/);
  frame.url = pathToFileURL(path.resolve('src/public/splash.html')).href;
  assert.throws(() => assertRecordsSender(event, { filePath, devServerUrl: false }), /Недопустимый/);
});

test('records IPC validates senders before dispatch and unregisters all named actions', async () => {
  const requests = new Map();
  const ipc = { handle: (channel, callback) => requests.set(channel, callback), removeHandler: (channel) => requests.delete(channel) };
  const calls = [];
  const handler = new RecordsHandler({
    getCapabilities: () => capabilities,
    uploadFiles: async (payload) => { calls.push(payload); return { cancelled: false, files: [] }; },
  }, { ipc, wrap: (_channel, callback) => callback, assertSender: (event) => { if (!event.trusted) throw new Error('untrusted sender'); } });
  handler.register();
  assert.equal(requests.size, 5);
  assert.throws(() => requests.get(IPC_CHANNELS.records.uploadFiles)({ trusted: false }, reference), /untrusted/);
  assert.equal(calls.length, 0);
  await requests.get(IPC_CHANNELS.records.uploadFiles)({ trusted: true }, reference);
  assert.deepEqual(calls, [reference]);
  handler.register();
  assert.equal(requests.size, 5);
  handler.shutdown();
  assert.equal(requests.size, 0);
});
