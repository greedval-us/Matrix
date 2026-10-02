import assert from 'node:assert/strict';
import test from 'node:test';
import {
  groupSearchResults,
  getSearchSuggestions,
  buildResultNote,
} from '../../../src/renderer/utils/searchResults.js';

test('source metadata arriving after records preserves records and readable source name', () => {
  const results = [
    { type: 'object_data', source: '__proto__', fields: [['number', '70000000000']] },
    { type: 'object_data_base', source: '__proto__', name: 'Phone archive', info: 'Description' },
    { type: 'object_data', source: '__proto__', fields: [['mail', 'sample@example.test']] },
    { type: 'object_data_base', source: '__proto__', name: 'Updated archive', country: 'RU' },
  ];

  const groups = groupSearchResults(results);

  assert.equal(groups.length, 1);
  assert.equal(groups[0].name, 'Updated archive');
  assert.equal(groups[0].info, 'Description');
  assert.deepEqual(groups[0].data, [
    [['number', '70000000000']],
    [['mail', 'sample@example.test']],
  ]);
});

test('related searches exclude current query, duplicates and unsupported fields', () => {
  const results = [
    {
      type: 'object_data',
      fields: [
        ['number', '70000000000'],
        ['mail', 'first@example.test'],
        ['id', '21'],
      ],
    },
    {
      type: 'object_add_search',
      fields: [
        { key: 'mail', value: 'first@example.test' },
        { key: 'mail', value: 'second@example.test' },
      ],
    },
  ];

  const suggestions = getSearchSuggestions(
    results,
    { number: { value: '70000000000' } },
    new Set(['number', 'mail']),
    2,
  );

  assert.deepEqual(
    suggestions.map((item) => item.fieldValue),
    ['first@example.test', 'second@example.test'],
  );
});

test('notes escape every server field rendered as HTML', () => {
  const html = buildResultNote(
    {
      name: '<img src=x onerror=alert(1)>',
      info: '<script>info</script>',
      data: [[['unsafe', '<svg onload=alert(1)>']]],
    },
    () => '<b>label</b>',
  );

  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('&lt;script&gt;info'));
  assert.ok(html.includes('&lt;b&gt;label'));
  assert.ok(html.includes('&lt;svg'));
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<svg'));
});
