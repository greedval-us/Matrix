import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useTabStore } from '../../../src/renderer/stores/tabStore.js';

test('tabs created in the same millisecond keep independent results and select adjacent tab on close', () => {
  setActivePinia(createPinia());
  const store = useTabStore();
  const originalNow = Date.now;
  Date.now = () => 100;
  let first, second;
  try {
    first = store.addTab();
    second = store.addTab();
    store.getSearchState(first).results.push({ value: 'first result' });
  } finally {
    Date.now = originalNow;
  }

  assert.notEqual(first, second);
  assert.deepEqual(store.getSearchState(second).results, []);
  store.closeTab(second);
  assert.equal(store.state.activeTabId, first);
  assert.equal(store.getSearchState(first).results[0].value, 'first result');
  store.closeTab(first);
  assert.equal(store.state.tabs.length, 1);
});

test('selecting an absent tab cannot create orphan search state', () => {
  setActivePinia(createPinia());
  const store = useTabStore();
  const first = store.addTab();

  store.setActive(999);

  assert.equal(store.state.activeTabId, first);
  assert.equal(store.getSearchState(999), undefined);
});
