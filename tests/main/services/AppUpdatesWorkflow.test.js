import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppUpdatesController } from '../../../src/renderer/composables/useAppUpdates.js';

const release = { version: '1.0.28', name: 'Matrix 1.0.28', size: 104857600, notes: 'Исправления',
  publishedAt: '2026-11-16T10:00:00Z', platform: 'win32', arch: 'x64', kind: 'portable', sha256: 'a'.repeat(64) };
const snapshot = (overrides = {}) => ({ status: 'idle', currentVersion: '1.0.27', release: null,
  canInstall: true, progress: 0, error: '', checkedAt: null, ...overrides });
const settle = () => new Promise(resolve => setImmediate(resolve));

function bridge(overrides = {}) {
  let listener;
  let subscriptions = 0;
  let removals = 0;
  const api = {
    getState: async () => snapshot(),
    check: async () => snapshot({ status: 'available', release, checkedAt: 100 }),
    download: async () => snapshot({ status: 'ready', release, progress: 100 }),
    cancel: async () => snapshot({ status: 'available', release }),
    install: async () => snapshot({ status: 'installing', release, progress: 100 }),
    saveCopy: async () => ({ saved: true }),
    onState(callback) { listener = callback; subscriptions++; return () => { removals++; }; },
    ...overrides,
  };
  return { controller: createAppUpdatesController({ getApi: () => api }),
    emit: value => listener(value), counts: () => ({ subscriptions, removals }) };
}

test('header and settings share a subscription until the last consumer leaves', async () => {
  const fixture = bridge();
  const leaveHeader = fixture.controller.connect();
  const leaveSettings = fixture.controller.connect();
  await settle();
  assert.deepEqual(fixture.counts(), { subscriptions: 1, removals: 0 });
  leaveSettings();
  fixture.emit(snapshot({ status: 'available', release }));
  assert.equal(fixture.controller.hasUpdate.value, true);
  assert.deepEqual(fixture.counts(), { subscriptions: 1, removals: 0 });
  leaveHeader();
  leaveHeader();
  assert.deepEqual(fixture.counts(), { subscriptions: 1, removals: 1 });
  fixture.emit(snapshot());
  assert.equal(fixture.controller.hasUpdate.value, true);
});

test('a late initial snapshot cannot overwrite newer download progress', async () => {
  let resolveInitial;
  const fixture = bridge({ getState: () => new Promise(resolve => { resolveInitial = resolve; }) });
  const leave = fixture.controller.connect();
  fixture.emit(snapshot({ status: 'downloading', release, progress: 48 }));
  resolveInitial(snapshot());
  await settle();
  assert.equal(fixture.controller.state.value.status, 'downloading');
  assert.equal(fixture.controller.state.value.progress, 48);
  leave();
});

test('manual checks prevent overlap and retain an available update after an IPC failure', async () => {
  let rejectCheck;
  let checks = 0;
  const fixture = bridge({
    getState: async () => snapshot({ status: 'available', release }),
    check: () => { checks++; return new Promise((resolve, reject) => { rejectCheck = reject; }); },
  });
  const leave = fixture.controller.connect();
  await settle();
  const first = fixture.controller.check();
  await fixture.controller.check();
  assert.equal(checks, 1);
  rejectCheck(new Error('Сервер недоступен'));
  await first;
  assert.equal(fixture.controller.error.value, 'Сервер недоступен');
  assert.equal(fixture.controller.hasUpdate.value, true);
  assert.equal(fixture.controller.busy.value, false);
  fixture.emit(snapshot({ status: 'available', release }));
  assert.equal(fixture.controller.error.value, '');
  leave();
});

test('cancelling a download ignores its late completion and permits retry', async () => {
  let resolveDownload;
  const fixture = bridge({
    getState: async () => snapshot({ status: 'available', release }),
    download: () => new Promise(resolve => { resolveDownload = resolve; }),
  });
  const leave = fixture.controller.connect();
  await settle();
  const downloading = fixture.controller.download();
  fixture.emit(snapshot({ status: 'downloading', release, progress: 20 }));
  await fixture.controller.cancel();
  assert.equal(fixture.controller.state.value.status, 'available');
  resolveDownload(snapshot({ status: 'ready', release, progress: 100 }));
  await downloading;
  assert.equal(fixture.controller.state.value.status, 'available');
  assert.equal(fixture.controller.busy.value, false);
  leave();
});

test('restart is allowed only after a portable update is ready', async () => {
  let installs = 0;
  const fixture = bridge({ install: async () => { installs++; return snapshot({ status: 'installing', release }); } });
  const leave = fixture.controller.connect();
  await settle();
  await fixture.controller.install();
  fixture.emit(snapshot({ status: 'available', release }));
  await fixture.controller.install();
  fixture.emit(snapshot({ status: 'ready', release, canInstall: false, progress: 100 }));
  await fixture.controller.install();
  assert.equal(installs, 0);
  fixture.emit(snapshot({ status: 'ready', release, canInstall: true, progress: 100 }));
  await fixture.controller.install();
  assert.equal(installs, 1);
  assert.equal(fixture.controller.state.value.status, 'installing');
  leave();
});

test('saving an available release reports native-dialog cancellation separately from success', async () => {
  let saves = 0;
  const fixture = bridge({
    getState: async () => snapshot({ status: 'available', release, canInstall: false }),
    saveCopy: async () => ({ saved: ++saves > 1 }),
  });
  const leave = fixture.controller.connect();
  await settle();
  await fixture.controller.saveCopy();
  assert.equal(fixture.controller.message.value, '');
  await fixture.controller.saveCopy();
  assert.ok(fixture.controller.message.value.length > 0);
  assert.equal(fixture.controller.busy.value, false);
  leave();
});

test('browser previews without a desktop bridge remain usable', async () => {
  const controller = createAppUpdatesController({ getApi: () => { throw new Error('no bridge'); } });
  const leave = controller.connect();
  await controller.check();
  assert.equal(controller.supported.value, false);
  assert.equal(controller.hasUpdate.value, false);
  assert.equal(controller.busy.value, false);
  assert.equal(controller.error.value, '');
  leave();
});
