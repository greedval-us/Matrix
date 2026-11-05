import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useSearchStore } from '../../../src/renderer/stores/searchStore.js';

test('loading remains true until every overlapping connection action finishes', async () => {
  const connections = new Map();
  globalThis.window = { searchAPI: {
    createClient: (id) => new Promise((resolve) => connections.set(id, resolve)),
  } };
  setActivePinia(createPinia());
  const store = useSearchStore();
  const first = store.createClient(1);
  const second = store.createClient(2);
  connections.get(1)({ status: 'ready' });
  await first;
  assert.equal(store.state.isLoading, true);
  connections.get(2)({ status: 'ready' });
  await second;
  assert.equal(store.state.isLoading, false);
});

test('rejecting a duplicate request does not clear the running request state', async () => {
  let complete;
  globalThis.window = { searchAPI: {
    createClient: async () => ({}), onProgress: () => () => {},
    run: () => new Promise((resolve) => { complete = resolve; }),
  } };
  setActivePinia(createPinia());
  const store = useSearchStore();
  await store.createClient(1);
  const running = store.search(1, {});
  await assert.rejects(store.search(1, {}), /уже выполняется/);
  assert.equal(store.state.isSearching[1], true);
  complete({});
  await running;
  assert.equal(store.state.isSearching[1], false);
});
