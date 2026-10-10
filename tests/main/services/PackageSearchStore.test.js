import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { usePackagesSearchStoreUI } from '../../../src/renderer/stores/uistore/packejesSearchStoreUI.js';
import ExportManager from '../../../src/renderer/services/export/MenegerExport.js';

function setup({
  openFolder = async () => 'C:/exports',
  run,
  createClient = async () => ({}),
} = {}) {
  let progress;
  const writes = [];
  globalThis.window = {
    searchAPI: {
      createClient,
      destroyClient: async () => {},
      cancel: () => {},
      onProgress: (callback) => {
        progress = callback;
        return () => {};
      },
      run:
        run ||
        (async (id, payload) => {
          progress({
            tabId: id,
            type: 'chunk',
            items: [{ object_data: { source_name: 'test', fields: { number: payload.number } } }],
            received: 1,
          });
          return { returned_hits: '1', partial: true };
        }),
    },
    fileDialog: { openFolder },
    fileAPI: { write: async (path, content) => writes.push({ path, content }) },
  };
  setActivePinia(createPinia());
  return { store: usePackagesSearchStoreUI(), writes };
}

test('batch search preserves repeated queries in separate files and labels partial responses', async () => {
  const { store, writes } = setup();
  store.queryText = '70000000000\n70000000000';

  await store.runSearch();

  assert.deepEqual(
    writes.map((file) => file.path),
    ['C:/exports/1-70000000000.txt', 'C:/exports/2-70000000000.txt'],
  );
  assert.ok(writes.every((file) => file.content.includes('70000000000')));
  assert.ok(store.logs.some((log) => log.includes('выдача частичная')));
  assert.equal(store.isRunning, false);
});

test('stopping during folder selection prevents creating a client and duplicate jobs', async () => {
  let selected;
  let folderCalls = 0,
    clientCalls = 0;
  const { store, writes } = setup({
    openFolder: () => {
      folderCalls++;
      return new Promise((resolve) => {
        selected = resolve;
      });
    },
    createClient: async () => {
      clientCalls++;
    },
  });
  store.queryText = '70000000000';
  const pending = store.runSearch();

  await store.runSearch();
  store.cancelSearch();
  selected('C:/exports');
  await pending;

  assert.equal(folderCalls, 1);
  assert.equal(clientCalls, 0);
  assert.equal(writes.length, 0);
  assert.equal(store.isRunning, false);
});

test('a batch without export formats never asks for a folder', async () => {
  let opened = false;
  const { store } = setup({
    openFolder: async () => {
      opened = true;
    },
  });
  store.queryText = '70000000000';
  store.formats.txt = false;

  await store.runSearch();

  assert.equal(opened, false);
  assert.ok(store.logs.some((log) => log.includes('формат')));
});

test('stopping while export prepares content prevents writing that file', async (t) => {
  const originalExport = ExportManager.prototype.export;
  let contentReady;
  let exportStarted;
  const started = new Promise((resolve) => { exportStarted = resolve; });
  ExportManager.prototype.export = () => {
    exportStarted();
    return new Promise((resolve) => { contentReady = resolve; });
  };
  t.after(() => { ExportManager.prototype.export = originalExport; });
  const { store, writes } = setup();
  store.queryText = '70000000000';
  const running = store.runSearch();
  await started;
  store.cancelSearch();
  contentReady('prepared content');
  await running;
  assert.deepEqual(writes, []);
  assert.equal(store.isRunning, false);
});

test('batch removes empty rows while preserving raw whitespace and repeated values', async () => {
  const payloads = [];
  const { store, writes } = setup({ run: async (_id, payload) => {
    payloads.push(payload);
    return { returned_hits: '0' };
  } });
  store.queryText = '\r\n 70000000000 \r\n  \r\n 70000000000 \r\n';
  await store.runSearch();
  assert.deepEqual(payloads, [{ number: ' 70000000000 ' }, { number: ' 70000000000 ' }]);
  assert.equal(writes.length, 2);
});

test('batch continues after one rejected query and closes the shared client once', async () => {
  let calls = 0, destroyed = 0;
  const { store, writes } = setup({ run: async () => {
    if (++calls === 1) throw new Error('query unavailable');
    return { returned_hits: '0' };
  } });
  window.searchAPI.destroyClient = async () => { destroyed++; };
  store.queryText = 'first\nsecond';
  await store.runSearch();
  assert.equal(calls, 2);
  assert.equal(destroyed, 1);
  assert.deepEqual(writes.map(({ path }) => path), ['C:/exports/2-second.txt']);
  assert.ok(store.logs.some((line) => line.includes('Ошибка запроса 1: query unavailable')));
  assert.equal(store.isRunning, false);
});
