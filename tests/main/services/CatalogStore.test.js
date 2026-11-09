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

test('catalog pages bound rendered rows while every source and global totals remain accessible', async () => {
  const rows = Array.from({ length: 290 }, (_, index) => ({
    name_table: `source-${index}`, name: `Source ${index}`, type: index % 2 ? 'B' : 'A', count: String(index + 1),
  }));
  globalThis.window = { searchAPI: { listDatabases: async () => rows } };
  setActivePinia(createPinia());
  const store = useDatabaseStore();
  await store.fetchAll();

  assert.equal(store.state.page, 1);
  assert.equal(store.pageCount, 6);
  assert.equal(store.pagedRows.length, 50);
  assert.equal(store.filteredRowCount, 290);
  assert.equal(store.filteredCountSum, 42195);
  const visited = [];
  for (let page = 1; page <= store.pageCount; page += 1) {
    store.setPage(page);
    assert.ok(store.pagedRows.length <= 50);
    visited.push(...store.pagedRows.map((row) => row.name_table));
  }
  assert.equal(store.pagedRows.length, 40);
  assert.deepEqual(visited, rows.map((row) => row.name_table));
  store.setPage(99);
  assert.equal(store.state.page, 6);
  store.setPage(0);
  assert.equal(store.state.page, 1);
});

test('catalog sorts and filters the complete catalog before selecting a page', async () => {
  const rows = Array.from({ length: 121 }, (_, index) => ({
    name_table: `source-${index}`, name: `Source ${index}`, type: index % 2 ? 'B' : 'A', count: String(index + 1),
  }));
  globalThis.window = { searchAPI: { listDatabases: async () => rows } };
  setActivePinia(createPinia());
  const store = useDatabaseStore();
  await store.fetchAll();
  store.setPage(3);
  store.setSort('count');
  assert.equal(store.state.page, 1);
  store.setSort('count');
  assert.equal(store.pagedRows[0].name_table, 'source-120');
  store.setPage(2);
  assert.equal(store.pagedRows[0].name_table, 'source-70');
  store.setFilter('A');
  assert.equal(store.state.page, 1);
  assert.equal(store.filteredRowCount, 61);
  assert.equal(store.filteredCountSum, 3721);
  assert.equal(store.pageCount, 2);
  assert.equal(store.pagedRows[0].name_table, 'source-120');
  store.setPage(2);
  assert.equal(store.pagedRows.length, 11);
  assert.equal(store.pagedRows.at(-1).name_table, 'source-0');
  store.setFilter('missing');
  assert.equal(store.pageCount, 1);
  assert.equal(store.state.page, 1);
  assert.deepEqual(store.pagedRows, []);
});

test('catalog refresh preserves a valid page and clamps it when sources disappear', async () => {
  let length = 290;
  globalThis.window = { searchAPI: { listDatabases: async () => Array.from({ length }, (_, index) => ({
    name_table: `source-${index}`, count: '1',
  })) } };
  setActivePinia(createPinia());
  const store = useDatabaseStore();
  await store.fetchAll();
  store.setPage(6);
  await store.fetchAll();
  assert.equal(store.state.page, 6);
  length = 55;
  await store.fetchAll();
  assert.equal(store.state.page, 2);
  assert.equal(store.pagedRows.length, 5);
  assert.equal(store.pagedRows[0].name_table, 'source-50');
  store.reset();
  assert.equal(store.state.page, 1);
  assert.equal(store.pageCount, 1);
  assert.deepEqual(store.pagedRows, []);
});
