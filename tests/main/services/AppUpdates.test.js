import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AppUpdateService } from '../../../src/main/services/updates/AppUpdateService.js';
import { compareVersions, validateRelease } from '../../../src/main/services/updates/releasePolicy.js';

const bytes = Buffer.from('fixture application bytes');
const target = { platform: 'win32', arch: 'x64', kind: 'portable' };
const release = { ...target, version: '1.0.28', name: 'Matrix.exe', size: String(bytes.length), sha256: createHash('sha256').update(bytes).digest('hex'), notes: 'Новая версия', published_at: '2026-11-16T10:00:00Z' };
async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'matrix-update-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const repository = { getLatest: async () => release, async *download() { yield bytes; }, shutdown() {}, ...overrides.repository };
  const installed = [];
  const service = new AppUpdateService({ repository, currentVersion: '1.0.27', target, directory,
    installer: { canInstall: true, prepare: async value => { installed.push(value); } },
    ...overrides, repository });
  return { service, directory, installed };
}

test('release policy compares numeric versions and rejects mismatched or unsafe release metadata', () => {
  assert.equal(compareVersions('1.0.100', '1.0.99'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(compareVersions('1.0.27', '1.0.27'), 0);
  assert.throws(() => compareVersions('1.0.0-beta', '1.0.0'));
  assert.equal(validateRelease(release, target).size, bytes.length);
  for (const invalid of [{ name: '../x.exe' }, { name: 'C:\\x.exe' }, { sha256: 'x' }, { size: '0' }, { size: '2147483649' }, { arch: 'arm64' }, { version: '01.0.0' }]) {
    assert.throws(() => validateRelease({ ...release, ...invalid }, target));
  }
});

test('newer release is offered, streamed to disk and verified before installer preparation', async t => {
  const { service, installed } = await fixture(t);
  assert.equal((await service.check()).status, 'available');
  assert.equal((await service.download()).status, 'ready');
  assert.equal(service.getState().progress, 100);
  assert.equal('filePath' in service.getState(), false);
  await service.install();
  assert.equal(installed.length, 1);
  assert.deepEqual(await readFile(installed[0].filePath), bytes);
  assert.equal(installed[0].sha256, release.sha256);
});

test('equal and older versions and legacy server do not advertise an update', async t => {
  for (const version of ['1.0.27', '1.0.9']) {
    const { service } = await fixture(t, { repository: { getLatest: async () => ({ ...release, version }) } });
    assert.equal((await service.check()).release, null);
  }
  for (const code of [5, 12]) {
    const { service } = await fixture(t, { repository: { getLatest: async () => { throw Object.assign(new Error('private server detail'), { code }); } } });
    assert.equal((await service.check()).status, 'idle');
  }
});

test('bad hash, truncated and oversized downloads never become ready and remove partial files', async t => {
  for (const data of [Buffer.alloc(bytes.length), bytes.subarray(0, 3), Buffer.concat([bytes, bytes])]) {
    const { service, directory, installed } = await fixture(t, { repository: { async *download() { yield data; } } });
    await service.check();
    assert.equal((await service.download()).status, 'error');
    await assert.rejects(service.install());
    assert.equal(installed.length, 0);
    assert.deepEqual(await readdir(directory), []);
  }
});

test('overlapping checks and downloads are single flight, cancelling preserves retry', async t => {
  let finishCheck;
  let calls = 0;
  const { service, directory } = await fixture(t, { repository: {
    getLatest: () => { calls++; return new Promise(resolve => { finishCheck = resolve; }); },
    async *download(_release, { signal }) { yield bytes.subarray(0, 3); await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); },
  } });
  const first = service.check();
  const second = service.check();
  finishCheck(release);
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  const downloading = service.download();
  while (service.getState().progress === 0) await new Promise(resolve => setImmediate(resolve));
  await service.cancel();
  await downloading;
  assert.equal(service.getState().status, 'available');
  assert.deepEqual(await readdir(directory), []);
});

test('save copy is verified again and native dialog cancellation keeps the staged update', async t => {
  const { service, directory } = await fixture(t);
  await service.check();
  await service.download();
  assert.deepEqual(await service.saveCopy(async () => null), { saved: false });
  const destination = path.join(directory, 'saved.exe');
  assert.deepEqual(await service.saveCopy(async () => destination), { saved: true });
  assert.deepEqual(await readFile(destination), bytes);
});

test('failed installer preparation retains ready update and does not quit; staged tampering blocks save', async t => {
  const { service, directory } = await fixture(t, { installer: { canInstall: true, prepare: async () => { throw new Error('helper failed'); } } });
  await service.check();
  await service.download();
  await assert.rejects(service.install());
  assert.equal(service.getState().status, 'ready');
  const staged = (await readdir(directory)).find(name => name.endsWith('.exe'));
  await writeFile(path.join(directory, staged), 'tampered');
  await assert.rejects(service.saveCopy(async () => path.join(directory, 'copy.exe')));
});

test('a missing or damaged staged update can be downloaded again after installation is rejected', async t => {
  const { service, directory, installed } = await fixture(t);
  await service.check();
  await service.download();
  const staged = (await readdir(directory)).find(name => name.endsWith('.exe'));
  await writeFile(path.join(directory, staged), 'changed');
  await assert.rejects(service.install());
  assert.equal(service.getState().status, 'error');
  assert.equal(installed.length, 0);
  assert.equal((await service.download()).status, 'ready');
});

test('manual check refreshes a downloaded release and preserves it only when its identity matches', async t => {
  let latest = release;
  let checks = 0;
  const { service, directory } = await fixture(t, { repository: { getLatest: async () => { checks++; return latest; } } });
  await service.check();
  await service.download();
  assert.equal((await service.check({ force: true })).status, 'ready');
  assert.equal(checks, 2);
  latest = { ...release, version: '1.0.29' };
  assert.equal((await service.check({ force: true })).status, 'available');
  assert.equal(service.getState().release.version, '1.0.29');
  assert.deepEqual(await readdir(directory), []);
});

test('shutdown waits for portable preparation before removing its staged source', async t => {
  let completePreparation;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const { service, directory } = await fixture(t, { installer: { canInstall: true,
    prepare: async ({ filePath }) => { entered(filePath); await new Promise(resolve => { completePreparation = resolve; }); assert.deepEqual(await readFile(filePath), bytes); },
  } });
  await service.check(); await service.download();
  const installing = service.install();
  await started;
  let stopped = false;
  const stopping = service.shutdown().then(() => { stopped = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(stopped, false);
  completePreparation();
  await Promise.all([installing, stopping]);
  assert.deepEqual(await readdir(directory), []);
});
