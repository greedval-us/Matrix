import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { GrpcReleaseRepository } from '../../../src/main/services/updates/GrpcReleaseRepository.js';
import { createPreloadApis } from '../../../src/shared/createPreloadApis.js';
import { IPC_CHANNELS } from '../../../src/shared/constants/ipcChannels.js';
import { validateRelease } from '../../../src/main/services/updates/releasePolicy.js';

const data = Buffer.from('test release');
const target = { platform: 'win32', arch: 'x64', kind: 'portable' };
const raw = { ...target, version: '1.1.0', name: 'Matrix.exe', size: String(data.length), sha256: createHash('sha256').update(data).digest('hex'), published_at: '', notes: '' };
function fixture(frames = [{ release: raw }, { data }]) {
  const config = { endpoint: 'localhost:50051', apiKey: 'test-key', caCertificate: Buffer.from('test cert'), connectionTimeoutMs: 2000 };
  const calls = []; let closed = 0;
  class Client {
    constructor(endpoint, certificate) { assert.equal(endpoint, config.endpoint); assert.deepEqual(certificate, config.caCertificate); }
    getLatest(request, metadata, options, callback) { calls.push({ request, metadata, options }); queueMicrotask(() => callback(null, raw)); return { cancel() {} }; }
    download(request, metadata, options) { calls.push({ request, metadata, options }); const stream = Readable.from(frames); stream.cancel = () => stream.destroy(); return stream; }
    close() { closed++; }
  }
  Client.prototype.getLatest.path = '/matrix.releases.v1.Releases/GetLatest';
  Client.prototype.download.path = '/matrix.releases.v1.Releases/Download';
  const signed = [];
  config.signDeviceRequest = method => { signed.push(method); return { 'device-proof': method }; };
  const repository = new GrpcReleaseRepository({ connectionService: { getResolvedConfig: async () => config }, dependencies: {
    grpc: { credentials: { createSsl: value => value }, Metadata: class { set(key, value) { this[key] = value; } } },
    loadProto: () => ({ matrix: { releases: { v1: { Releases: Client } } } }),
  } });
  return { repository, config, calls, signed, closed: () => closed };
}
test('release transport authenticates exact methods and validates header before yielding bytes', async () => {
  const f = fixture();
  const release = validateRelease(await f.repository.getLatest(target), target);
  const chunks = [];
  for await (const chunk of f.repository.download(release, { signal: new AbortController().signal })) chunks.push(chunk);
  assert.deepEqual(Buffer.concat(chunks), data);
  assert.deepEqual(f.signed, ['/matrix.releases.v1.Releases/GetLatest', '/matrix.releases.v1.Releases/Download']);
  assert.equal(f.calls[1].metadata['x-api-key'], 'test-key');
  assert.equal(f.calls[1].request.sha256, raw.sha256);
  assert.equal(f.closed(), 2);
});
test('changed server settings or mismatched metadata cannot supply a previously advertised update', async () => {
  const f = fixture();
  const release = validateRelease(await f.repository.getLatest(target), target);
  f.config.endpoint = 'changed.invalid:50051';
  await assert.rejects(async () => { for await (const _ of f.repository.download(release, { signal: new AbortController().signal })) {} });
  for (const frames of [[{ data }], [{ release: { ...raw, version: '2.0.0' } }, { data }], [{ release: raw }, { release: raw }]]) {
    const broken = fixture(frames);
    await broken.repository.getLatest(target);
    await assert.rejects(async () => { for await (const _ of broken.repository.download(release, { signal: new AbortController().signal })) {} });
    assert.equal(broken.closed(), 2);
  }
});
test('update preload exposes no paths or arbitrary channels and strips Electron events', async () => {
  let request; let listener; let removed;
  const { updateAPI } = createPreloadApis({ invoke: async (...args) => { request = args; }, on: (_, fn) => { listener = fn; }, removeListener: (_, fn) => { removed = fn; } });
  await updateAPI.install('malicious.exe');
  assert.deepEqual(request, [IPC_CHANNELS.update.install]);
  let received;
  const stop = updateAPI.onState((...args) => { received = args; });
  listener({ sender: 'secret' }, { status: 'ready' });
  assert.deepEqual(received, [{ status: 'ready' }]);
  stop(); assert.equal(removed, listener);
  assert.equal(updateAPI.invoke, undefined);
});
