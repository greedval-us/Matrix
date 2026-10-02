import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useTabStore } from '../../../src/renderer/stores/tabStore.js';
import { useSearchUIStore } from '../../../src/renderer/stores/uistore/serchStoreUI.js';

function setup(api = {}) {
  globalThis.window = {
    searchAPI: {
      createClient: async () => ({}),
      destroyClient: async () => {},
      onProgress: () => () => {},
      run: async () => ({ returned_hits: '0' }),
      cancel: () => {},
      ...api,
    },
    storeAPI: { addHistoryItem: async (key, value) => ({ id: 'history', key, value }) },
  };
  setActivePinia(createPinia());
  const tabs = useTabStore();
  const id = tabs.addTab();
  const search = useSearchUIStore();
  search.toggleField(id, 'number');
  search.setFieldValue(id, 'number', '70000000000');
  return { tabs, id, search };
}

test('stopping while client connects prevents sending a query and cleans up the client', async () => {
  let connected;
  let queryCalls = 0,
    destroyed = 0;
  const { search, id, tabs } = setup({
    createClient: () =>
      new Promise((resolve) => {
        connected = resolve;
      }),
    run: async () => {
      queryCalls++;
      return {};
    },
    destroyClient: async () => {
      destroyed++;
    },
  });
  const pending = search.search(id);

  search.cancelSearch(id);
  connected({});
  await pending;

  assert.equal(queryCalls, 0);
  assert.equal(destroyed, 1);
  assert.equal(search.getLoading(id), false);
  assert.equal(search.getMeta(id).cancelled, true);
  assert.equal(tabs.getSearchState(id).hasSearched, true);
});

test('duplicate submissions and a closed tab cannot start another request', async () => {
  let connected;
  let clientCalls = 0,
    queryCalls = 0;
  const { search, tabs, id } = setup({
    createClient: () => {
      clientCalls++;
      return new Promise((resolve) => {
        connected = resolve;
      });
    },
    run: async () => {
      queryCalls++;
      return {};
    },
  });
  tabs.addTab();
  const pending = search.search(id);

  await search.search(id);
  search.cancelSearch(id);
  search.clearTab(id);
  tabs.closeTab(id);
  connected({});
  await pending;

  assert.equal(clientCalls, 1);
  assert.equal(queryCalls, 0);
  assert.equal(tabs.getSearchState(id), undefined);
});

test('server results survive a history write failure and duplicate records are removed', async () => {
  let progress;
  const { search, id } = setup({
    onProgress: (callback) => {
      progress = callback;
      return () => {};
    },
    run: async () => {
      progress({
        tabId: id,
        type: 'chunk',
        received: 2,
        items: [
          { object_data: { source_name: 'source', fields: { number: '70000000000', id: '1' } } },
          { object_data: { source_name: 'source', fields: { number: '70000000000', id: '2' } } },
        ],
      });
      return { returned_hits: '2', total_hits: '2', partial: true };
    },
  });
  window.storeAPI.addHistoryItem = async () => {
    throw new Error('history unavailable');
  };

  await search.search(id);

  assert.equal(search.getError(id), '');
  assert.equal(search.getResults(id).length, 1);
  assert.equal(search.getReceived(id), 2);
  assert.equal(search.getMeta(id).partial, true);
  assert.equal(search.getLoading(id), false);
});

test('connection failure is visible and cleanup failure cannot replace it', async () => {
  const { search, id } = setup({
    createClient: async () => {
      throw new Error('connection unavailable');
    },
    destroyClient: async () => {
      throw new Error('cleanup failed');
    },
  });

  await search.search(id);

  assert.equal(search.getError(id), 'connection unavailable');
  assert.equal(search.getLoading(id), false);
});
