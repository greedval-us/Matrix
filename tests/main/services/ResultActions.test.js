import test from 'node:test';
import assert from 'node:assert/strict';
import { effectScope, nextTick, ref } from 'vue';
import { useSearchResults } from '../../../src/renderer/composables/useSearchResults.js';

function setup({ addNote = async () => {}, clipboard = { writeText: async () => {} } } = {}) {
  const results = ref([{ type: 'object_data', source: 'A', fields: [['number', '<123>']] }]);
  const searchUI = {
    getResults: () => results.value, getLoading: () => false, getError: () => '',
    getMeta: () => null, getReceived: () => 1, getSelectedFields: () => ({}),
    getActiveBase: () => 'A', getFieldLabel: key => key,
    search: async () => {}, quickSearch: async () => {},
  };
  const scope = effectScope();
  const view = scope.run(() => useSearchResults({
    tabId: () => 1, searchUI, tabStore: { getSearchState: () => ({ hasSearched: true }), addTab: () => 2 },
    notesStore: { addNote }, clipboard,
  }));
  return { results, scope, view };
}

test('result note actions escape content, prevent overlapping saves and update action state', async () => {
  let complete, calls = 0, text;
  const { view, scope } = setup({ addNote: value => {
    calls++; text = value; return new Promise(resolve => { complete = resolve; });
  } });
  try {
    const saving = view.saveNote(view.bases.value[0]);
    await view.saveNote(view.bases.value[0]);
    assert.equal(calls, 1);
    assert.match(text, /&lt;123&gt;/);
    assert.equal(view.savingSources.value.has('A'), true);
    complete();
    await saving;
    assert.equal(view.savedSources.value.has('A'), true);
    assert.equal(view.savingSources.value.has('A'), false);
  } finally { scope.stop(); }
});

test('late note completion does not mark a new search as saved', async () => {
  let complete;
  const { view, scope, results } = setup({ addNote: () => new Promise(resolve => { complete = resolve; }) });
  try {
    const saving = view.saveNote(view.bases.value[0]);
    results.value = [{ type: 'object_data', source: 'A', fields: [['number', '456']] }];
    await nextTick();
    complete();
    await saving;
    assert.equal(view.savedSources.value.size, 0);
  } finally { scope.stop(); }
});

test('clipboard and note errors release action state and expose a useful message', async () => {
  const { view, scope } = setup({
    addNote: async () => { throw new Error('storage unavailable'); },
    clipboard: { writeText: async () => { throw new Error('denied'); } },
  });
  try {
    await view.copyValue('123');
    assert.match(view.notice.value, /Не удалось скопировать/);
    await view.saveNote(view.bases.value[0]);
    assert.equal(view.notice.value, 'storage unavailable');
    assert.equal(view.savingSources.value.size, 0);
  } finally { scope.stop(); }
});
