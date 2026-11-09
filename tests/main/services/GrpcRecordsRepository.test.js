import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { grpc, loadProto } from '../../../src/main/utils/grpcLoader.js';
import { GrpcRecordsRepository } from '../../../src/main/services/records/GrpcRecordsRepository.js';
import { RecordsService } from '../../../src/main/services/RecordsService.js';
import { RecordsHandler } from '../../../src/main/ipc/RecordsHandler.js';

const capabilities = { available: true, list: true, upload: true, download: true, remove: true, create: true, update: true, delete: true, message: '' };
const fileId = 'dd23bb90-0c56-42b4-8d81-b35c2455ed66';
const metadata = { id: fileId, name: 'отчёт.bin', size: '3', mime_type: 'application/octet-stream' };
const config = endpoint => ({ endpoint, caCertificate: Buffer.from('test CA'), tlsServerName: 'matrix.test', apiKey: 'client-secret', connectionTimeoutMs: 1000 });
// Production still calls createSsl. Only loopback tests replace the credentials.
const testGrpc = { ...grpc, credentials: { ...grpc.credentials, createSsl: () => grpc.credentials.createInsecure() } };

async function loopback(t, handlers = {}) {
  const requests = [];
  const server = new grpc.Server();
  const capture = (name, fn) => (call, callback) => {
    requests.push({ name, request: call.request, key: call.metadata.get('x-api-key')[0], deadline: call.getDeadline() });
    fn(call, callback);
  };
  server.addService(loadProto('records.proto').matrix.records.v1.Records.service, Object.fromEntries(Object.entries({
    getCapabilities: (_call, callback) => callback(null, capabilities),
    listRecords: (_call, callback) => callback(null, { columns: [{ key: 'number', label: 'Номер', type: 'text', sortable: true }], rows: [{ id: '9007199254740993', values: { number: '+001' }, files: [metadata] }], total: '1' }),
    uploadFiles: (call, callback) => { call.resume(); call.on('end', () => callback(null, { files: [metadata] })); },
    downloadFile: call => { call.write({ file: metadata }); call.write({ data: Buffer.from([0, 255, 7]) }); call.end(); },
    removeFile: (_call, callback) => callback(null, { deleted: true }),
    ...handlers,
  }).map(([name, fn]) => [name, capture(name, fn)])));
  const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0', grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
  t.after(() => server.forceShutdown());
  return { endpoint: `127.0.0.1:${port}`, requests };
}

function repository(t, connectionService, dependencies = {}) {
  const repo = new GrpcRecordsRepository({ connectionService, dependencies: { grpc: testGrpc, ...dependencies } });
  t.after(() => repo.shutdown());
  return repo;
}

async function localFiles(t, contents = [Buffer.from([0, 255, 7])]) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'matrix-records-grpc-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return Promise.all(contents.map(async (bytes, index) => {
    const name = index === 0 ? 'отчёт.bin' : `файл-${index}.dat`;
    const filePath = path.join(directory, name);
    await writeFile(filePath, bytes);
    return { path: filePath, name, size: bytes.length };
  }));
}

test('records use the current connection and client key for every operation and preserve bigint IDs', async t => {
  const first = await loopback(t);
  const second = await loopback(t);
  let current = config(first.endpoint);
  const repo = repository(t, { getResolvedConfig: async () => current });
  assert.deepEqual(await repo.getCapabilities(), capabilities);
  current = { ...config(second.endpoint), apiKey: 'changed-client-key' };
  const result = await repo.list({ query: 'Иван', sort: { key: 'date', direction: 'desc' }, page: 2, pageSize: 50 });
  assert.deepEqual(result, { columns: [{ key: 'number', label: 'Номер', type: 'text', sortable: true }], rows: [{ id: '9007199254740993', values: { number: '+001' }, files: [{ id: fileId, name: 'отчёт.bin', size: 3, mimeType: 'application/octet-stream' }] }], total: 1 });
  assert.deepEqual(second.requests[0].request, { query: 'Иван', sort_key: 'date', sort_direction: 'desc', page: 2, page_size: 50 });
  assert.equal(second.requests[0].key, 'changed-client-key');
  assert.ok(second.requests[0].deadline <= Date.now() + 1100);
  assert.equal(first.requests.length, 1);
});

test('unconfigured, unavailable and older servers honestly disable records without hiding authentication errors', async t => {
  const absent = repository(t, { getResolvedConfig: async () => { throw new Error('secret config path'); } });
  assert.equal((await absent.getCapabilities()).available, false);
  assert.doesNotMatch((await absent.getCapabilities()).message, /secret/);
  for (const code of [grpc.status.UNIMPLEMENTED, grpc.status.UNAVAILABLE]) {
    const remote = await loopback(t, { getCapabilities: (_call, callback) => callback({ code, details: 'private server details' }) });
    const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
    assert.deepEqual(Object.values(await repo.getCapabilities()).slice(0, 5), [false, false, false, false, false]);
  }
  const remote = await loopback(t, { getCapabilities: (_call, callback) => callback({ code: grpc.status.UNAUTHENTICATED, details: 'client-secret' }) });
  await assert.rejects(repository(t, { getResolvedConfig: async () => config(remote.endpoint) }).getCapabilities(), error => /API-ключ/.test(error.message) && !error.message.includes('client-secret'));
});

test('invalid totals and unconfirmed removals cannot report success', async t => {
  const remote = await loopback(t, {
    listRecords: (_call, callback) => callback(null, { columns: [], rows: [], total: '9007199254740992' }),
    removeFile: (_call, callback) => callback(null, { deleted: false }),
  });
  const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
  await assert.rejects(repo.list({ query: '', sort: null, page: 1, pageSize: 25 }), /ответ|количество|число/i);
  await assert.rejects(repo.removeFile({ rowId: '7', fileId }), /подтвердил/);
  assert.deepEqual(remote.requests[1].request, { row_id: '7', file_id: fileId });
});

test('CRUD uses the ordinary key, preserves stable IDs and requires deletion confirmation', async t => {
  const row = { id: '9007199254740993', values: { fio: 'Запись', initiator: 'Инициатор' }, files: [] };
  const remote = await loopback(t, {
    createRecord: (_call, callback) => callback(null, row),
    updateRecord: (_call, callback) => callback(null, row),
    deleteRecord: (_call, callback) => callback(null, { deleted: false }),
  });
  const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
  assert.deepEqual(await repo.createRecord({ values: { fio: 'Запись', initiator: 'Инициатор' } }), row);
  assert.equal((await repo.updateRecord({ rowId: row.id, values: { initiator: '', note: '' } })).id, row.id);
  await assert.rejects(repo.deleteRecord({ rowId: row.id }), /подтвердил/);
  assert.deepEqual(remote.requests.map(call => call.key), ['client-secret', 'client-secret', 'client-secret']);
  assert.deepEqual(remote.requests[0].request, { values: { fio: 'Запись', initiator: 'Инициатор' } });
  assert.deepEqual(remote.requests[1].request, { id: row.id, values: { initiator: '', note: '' } });
});

test('servers without CRUD capability fields keep editing disabled', async t => {
  const remote = await loopback(t, { getCapabilities: (_call, callback) => callback(null, { available: true, list: true }) });
  const result = await repository(t, { getResolvedConfig: async () => config(remote.endpoint) }).getCapabilities();
  assert.equal(result.list, true);
  assert.equal(result.create, false);
  assert.equal(result.update, false);
  assert.equal(result.delete, false);
});

test('uploads stream an atomic batch with one header per file, exact binary bytes and file deadlines', async t => {
  const frames = [];
  const bytes = Buffer.alloc(130000, 171);
  const remote = await loopback(t, { uploadFiles: (call, callback) => {
    call.on('data', frame => frames.push(frame));
    call.on('end', () => callback(null, { files: [{ ...metadata, size: String(bytes.length) }, { id: 'b', name: 'файл-1.dat', size: '0', mime_type: '' }] }));
  } });
  const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
  const before = Date.now();
  const result = await repo.uploadFiles({ rowId: '7', files: await localFiles(t, [bytes, Buffer.alloc(0)]) });
  assert.equal(result.files.length, 2);
  assert.deepEqual(frames.filter(frame => frame.chunk === 'header').map(frame => frame.header), [
    { row_id: '7', name: 'отчёт.bin', size: '130000', mime_type: '' },
    { row_id: '7', name: 'файл-1.dat', size: '0', mime_type: '' },
  ]);
  assert.deepEqual(Buffer.concat(frames.filter(frame => frame.chunk === 'data').map(frame => frame.data)), bytes);
  assert.ok(frames.filter(frame => frame.chunk === 'data').every(frame => frame.data.length <= 65536));
  assert.ok(remote.requests[0].deadline >= before + 119000);
  assert.equal(remote.requests[0].key, 'client-secret');
});

test('oversize upload batches are rejected before opening a transport or reading contents', async t => {
  let connections = 0;
  const repo = repository(t, { getResolvedConfig: async () => { connections += 1; return config('unused:1'); } });
  const base = { path: 'never-read', name: 'large.bin', size: 26214401 };
  await assert.rejects(repo.uploadFiles({ rowId: '7', files: [base] }), /25|размер/);
  await assert.rejects(repo.uploadFiles({ rowId: '7', files: Array.from({ length: 21 }, () => ({ ...base, size: 1 })) }), /20|количество/);
  await assert.rejects(repo.uploadFiles({ rowId: '7', files: Array.from({ length: 5 }, () => ({ ...base, size: 26214400 })) }), /100|размер/);
  assert.equal(connections, 0);
});

test('upload backpressure prevents further file chunks until the transport drains', async t => {
  let maximumQueued = 0;
  let closed = 0;
  class Client {
    uploadFiles(_metadata, _options, callback) {
      const call = new Writable({ objectMode: true, highWaterMark: 1, write(_frame, _encoding, done) { setImmediate(done); }, final(done) { callback(null, { files: [{ ...metadata, size: '140000' }] }); done(); } });
      const write = call.write.bind(call);
      call.write = frame => { const result = write(frame); maximumQueued = Math.max(maximumQueued, call.writableLength); return result; };
      call.cancel = () => call.destroy();
      return call;
    }
    close() { closed += 1; }
  }
  const repo = repository(t, { getResolvedConfig: async () => config('unused:1') }, { loadProto: () => ({ matrix: { records: { v1: { Records: Client } } } }) });
  await repo.uploadFiles({ rowId: '7', files: await localFiles(t, [Buffer.alloc(140000, 3)]) });
  assert.equal(maximumQueued, 1);
  assert.equal(closed, 1);
});

test('upload errors and mismatched confirmation metadata never report a partial batch as successful', async t => {
  const files = await localFiles(t);
  for (const response of [{ files: [] }, { files: [{ ...metadata, size: '2' }] }]) {
    const remote = await loopback(t, { uploadFiles: (call, callback) => { call.resume(); call.on('end', () => callback(null, response)); } });
    const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
    await assert.rejects(repo.uploadFiles({ rowId: '7', files }), /подтвердил|ответ/);
  }
  const remote = await loopback(t, { uploadFiles: (_call, callback) => callback({ code: grpc.status.PERMISSION_DENIED, details: 'private filesystem path' }) });
  await assert.rejects(repository(t, { getResolvedConfig: async () => config(remote.endpoint) }).uploadFiles({ rowId: '7', files }), error => /прав/.test(error.message) && !error.message.includes('private'));
});

test('download returns bytes after metadata and validates the declared size', async t => {
  const remote = await loopback(t);
  const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
  const download = await repo.downloadFile({ rowId: '7', fileId });
  assert.equal(download.name, 'отчёт.bin');
  const chunks = [];
  for await (const chunk of download.stream) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), Buffer.from([0, 255, 7]));
  assert.deepEqual(remote.requests[0].request, { row_id: '7', file_id: fileId });
  for (const frames of [[{ data: Buffer.from([1]) }], [{ file: metadata }, { data: Buffer.from([1]) }], [{ file: metadata }, { data: Buffer.alloc(4) }], [{ file: metadata }, { file: metadata }]]) {
    const invalid = await loopback(t, { downloadFile: call => { for (const frame of frames) call.write(frame); call.end(); } });
    const adapter = repository(t, { getResolvedConfig: async () => config(invalid.endpoint) });
    await assert.rejects(async () => {
      const result = await adapter.downloadFile({ rowId: '7', fileId });
      for await (const _chunk of result.stream) { /* consume */ }
    }, /ответ|размер|метаданн/i);
  }
});

test('waiting for the save dialog keeps download buffering bounded and destroying the source cancels gRPC', async t => {
  let produced = 0;
  let cancelled = 0;
  let closed = 0;
  class Client {
    downloadFile() {
      const call = new Readable({ objectMode: true, highWaterMark: 1, read() {
        produced += 1;
        if (produced === 1) this.push({ file: { ...metadata, size: String(300 * 65536) } });
        else if (produced <= 301) this.push({ data: Buffer.alloc(65536) });
        else this.push(null);
      } });
      call.cancel = () => { cancelled += 1; call.destroy(); };
      return call;
    }
    close() { closed += 1; }
  }
  const repo = repository(t, { getResolvedConfig: async () => config('unused:1') }, { loadProto: () => ({ matrix: { records: { v1: { Records: Client } } } }) });
  const download = await repo.downloadFile({ rowId: '7', fileId });
  await nextTurn();
  assert.ok(produced < 10, `only bounded read-ahead is permitted, received ${produced} frames`);
  download.stream.destroy();
  await nextTurn();
  assert.equal(cancelled, 1);
  assert.equal(closed, 1);
});

test('destroying a partially consumed download immediately cancels a stalled next frame', async t => {
  let readCalls = 0;
  let cancelled = 0;
  let closed = 0;
  class Client {
    downloadFile() {
      const call = new Readable({ objectMode: true, highWaterMark: 1, read() {
        readCalls += 1;
        if (readCalls === 1) this.push({ file: metadata });
        else if (readCalls === 2) this.push({ data: Buffer.from([9]) });
        // The next read stalls until cancellation, as a disconnected server can.
      } });
      call.cancel = () => { cancelled += 1; call.destroy(); };
      return call;
    }
    close() { closed += 1; }
  }
  const repo = repository(t, { getResolvedConfig: async () => config('unused:1') }, { loadProto: () => ({ matrix: { records: { v1: { Records: Client } } } }) });
  const { stream } = await repo.downloadFile({ rowId: '7', fileId });
  stream.on('error', () => {});
  const firstChunk = await new Promise(resolve => stream.once('data', resolve));
  assert.deepEqual(firstChunk, Buffer.from([9]));
  await nextTurn();
  assert.equal(readCalls, 3);
  stream.destroy();
  assert.equal(cancelled, 1, 'destroy must cancel before waiting for the pending iterator');
  assert.equal(closed, 1, 'destroy must release the transport immediately');
});

test('handler shutdown cancels active repository RPCs and rejects new requests', async t => {
  let started;
  const pending = new Promise(resolve => { started = resolve; });
  const remote = await loopback(t, { listRecords: () => started() });
  const repo = repository(t, { getResolvedConfig: async () => config(remote.endpoint) });
  const handler = new RecordsHandler(new RecordsService({ repository: repo }), { ipc: {}, assertSender: () => {} });
  const request = repo.list({ query: '', sort: null, page: 1, pageSize: 25 });
  const rejected = assert.rejects(request, /отмен|закрыт/);
  await pending;
  await handler.shutdown();
  await rejected;
  await assert.rejects(repo.list({ query: '', sort: null, page: 1, pageSize: 25 }), /закрыт/);
});
