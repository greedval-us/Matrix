import test from 'node:test';
import assert from 'node:assert/strict';
import { useConnectionSettings } from '../../../src/renderer/composables/useConnectionSettings.js';
import { useIndexStatus, STATUS_POLL_INTERVAL_MS } from '../../../src/renderer/composables/useIndexStatus.js';

test('settings preserve redacted key semantics and recover after failure', async () => {
  let draft;
  const settings = useConnectionSettings({ searchAPI: {
    getConfig: async () => ({ endpoint: 'server:50051', hasApiKey: true }),
    setConfig: async value => { draft = value; return { ...value, apiKey: undefined, hasApiKey: true }; },
    testConnection: async () => { throw new Error('offline'); },
  } });
  await settings.loadConfig();
  assert.equal(settings.config.value.apiKey, '');
  await settings.saveConfig();
  assert.equal(draft.apiKey, '');
  assert.equal(settings.config.value.apiKey, '');
  assert.equal(settings.config.value.hasApiKey, true);
  await settings.testConnection();
  assert.equal(settings.error.value, 'offline');
  assert.equal(settings.busy.value, false);
});

test('settings prevent overlapping saves and retain the draft after rejection', async () => {
  let reject, calls = 0;
  const settings = useConnectionSettings({ searchAPI: {
    getConfig: async () => ({}),
    setConfig: () => { calls++; return new Promise((_, no) => { reject = no; }); },
  } });
  await settings.loadConfig();
  settings.config.value.apiKey = 'new-key';
  const saving = settings.saveConfig();
  await settings.saveConfig();
  assert.equal(calls, 1);
  reject(new Error('cannot save'));
  await saving;
  assert.equal(settings.config.value.apiKey, 'new-key');
  assert.equal(settings.saving.value, false);
});

test('stopping status polling clears its timer and ignores a late response', async () => {
  let resolveStatus;
  let interval, cleared;
  const view = useIndexStatus({
    searchAPI: {
      getConfig: async () => ({ endpoint: 'server' }),
      getIndexStatus: () => new Promise(resolve => { resolveStatus = resolve; }),
    },
    scheduler: {
      setInterval: (callback, delay) => { interval = { callback, delay }; return 7; },
      clearInterval: id => { cleared = id; },
    },
  });
  view.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(interval.delay, STATUS_POLL_INTERVAL_MS);
  view.stop();
  resolveStatus({ status: 'READY', progress_percent: 100 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cleared, 7);
  assert.equal(view.status.value, null);
  assert.equal(view.loading.value, false);
});

test('status refresh prevents overlap, shows failures and clamps progress', async () => {
  let calls = 0;
  const view = useIndexStatus({ searchAPI: {
    getConfig: async () => ({}),
    getIndexStatus: async () => {
      calls++;
      if (calls === 1) throw new Error('unavailable');
      return { progress_percent: 125 };
    },
  } });
  await Promise.all([view.refresh(), view.refresh()]);
  assert.equal(calls, 1);
  assert.equal(view.error.value, 'unavailable');
  assert.equal(view.loading.value, false);
  await view.refresh();
  assert.equal(view.progress.value, 100);
  assert.equal(view.error.value, '');
});
