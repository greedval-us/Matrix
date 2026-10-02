import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { usePackagesSearchStoreUI } from '../../../src/renderer/stores/uistore/packejesSearchStoreUI.js';

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
