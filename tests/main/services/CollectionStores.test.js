import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinia, setActivePinia } from 'pinia';
import { useNotesStore } from '../../../src/renderer/stores/notesStore.js';
import { useTasksStore } from '../../../src/renderer/stores/tasksStore.js';
import { useHistoryStore } from '../../../src/renderer/stores/historyStore.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(api) {
  globalThis.window = { storeAPI: api };
  setActivePinia(createPinia());
}

test('collection loading resets after a rejected operation without changing data', async () => {
  setup({ getNotes: async () => [{ id: 'old', text: 'keep' }], addNote: async () => { throw new Error('disk full'); } });
  const store = useNotesStore();
  await store.loadNotes();
  await assert.rejects(store.addNote('new'), /disk full/);
  assert.equal(store.state.isLoading, false);
  assert.deepEqual(store.state.notes, [{ id: 'old', text: 'keep' }]);
});

test('parallel history writes keep loading until every operation settles', async () => {
  const first = deferred(), second = deferred();
  setup({ addHistoryItem: key => key === 'first' ? first.promise : second.promise });
  const store = useHistoryStore();
  const a = store.addHistoryItem('first', 'A');
  const b = store.addHistoryItem('second', 'B');
  first.resolve({ id: 'a', key: 'first', value: 'A' });
  await a;
  assert.equal(store.state.isLoading, true);
  second.reject(new Error('write failed'));
  await assert.rejects(b, /write failed/);
  assert.equal(store.state.isLoading, false);
  assert.equal(store.state.history.length, 1);
});

test('task toggling awaits the canonical collection before resolving', async () => {
  const refreshed = deferred();
  let reads = 0;
  setup({
    getTasks: () => ++reads === 1 ? Promise.resolve([{ id: 'a', done: false }]) : refreshed.promise,
    toggleTaskDone: async () => true,
  });
  const store = useTasksStore();
  await store.loadTasks();
  let completed = false;
  const toggling = store.toggleTaskDone('a').then(() => { completed = true; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(completed, false);
  assert.equal(store.state.isLoading, true);
  refreshed.resolve([{ id: 'a', done: true, updatedAt: 'server-time' }]);
  await toggling;
  assert.equal(store.state.tasks[0].updatedAt, 'server-time');
  assert.equal(store.state.isLoading, false);
});
