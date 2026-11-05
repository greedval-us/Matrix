import assert from 'node:assert/strict';
import test from 'node:test';
import { createPinia, setActivePinia } from 'pinia';
import { useDatabaseStore } from '../../../src/renderer/stores/uistore/databaseStoreUI.js';

test('catalog filters unknown types and sorts counts numerically without reordering stored rows', async () => {
  globalThis.window = { searchAPI: { listDatabases: async () => [
    { name_table: 'first', name: 'First', type: 'A', count: '20' },
    { name_table: 'second', name: 'Second', type: 'A', count: '3' },
    { name_table: 'third', name: 'Third', count: '7' },
  ] } };
  setActivePinia(createPinia());
  const store = useDatabaseStore();
  await store.fetchAll();
  store.setFilter('A');
  store.setSort('count');
  assert.deepEqual(store.filteredRows.map((row) => row.name_table), ['second', 'first']);
  assert.equal(store.filteredCountSum, 23);
  store.setSort('count');
  assert.deepEqual(store.filteredRows.map((row) => row.name_table), ['first', 'second']);
  assert.deepEqual(store.state.rows.map((row) => row.name_table), ['first', 'second', 'third']);
  store.setFilter('Неизвестно');
  assert.equal(store.filteredRowCount, 1);
  assert.equal(store.filteredCountSum, 7);
});

test('catalog errors release loading and can be retried', async () => {
  globalThis.window = { searchAPI: { listDatabases: async () => { throw new Error('catalog unavailable'); } } };
  setActivePinia(createPinia());
  const store = useDatabaseStore();
  await store.fetchAll();
  assert.equal(store.state.loading, false);
  assert.equal(store.state.error, 'catalog unavailable');
  window.searchAPI.listDatabases = async () => [{ name_table: 'restored', count: '4' }];
  await store.fetchAll();
  assert.equal(store.state.error, null);
  assert.equal(store.filteredCountSum, 4);
});
