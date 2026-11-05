export function groupSearchResults(results) {
  const sources = new Map();
  for (const item of results) {
    if (!['object_data', 'object_data_base'].includes(item.type)) continue;
    const source = String(item.source || 'unknown');
    let group = sources.get(source);
    if (!group) {
      group = { source, name: source, info: '', data: [] };
      sources.set(source, group);
    }
    if (item.type === 'object_data_base') Object.assign(group, item, { source, data: group.data });
    else group.data.push(item.fields);
  }
  return [...sources.values()];
}

export const SEARCH_SUGGESTION_LIMIT = 24;

export function getSearchSuggestions(results, selectedFields, searchableFields, limit = SEARCH_SUGGESTION_LIMIT) {
  const seen = new Set(
    Object.entries(selectedFields).map(
      ([key, field]) => key + ':' + String(field?.value || '').trim(),
    ),
  );
  const suggestions = [];
  for (const item of results) {
    const fields =
      item.type === 'object_data'
        ? item.fields
        : item.type === 'object_add_search'
          ? Object.values(item.fields || {}).map((field) => [field.key, field.value])
          : [];
    for (const [key, rawValue] of fields) {
      const value = String(rawValue ?? '').trim();
      const fingerprint = key + ':' + value;
      if (!searchableFields.has(key) || !value || seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      suggestions.push({ fieldKey: key, fieldValue: value, preload: { [key]: { key, value } } });
      if (suggestions.length >= limit) return suggestions;
    }
  }
  return suggestions;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function buildResultNote(base, fieldLabel) {
  const records = base.data
    .map(
      (record) =>
        '<dl>' +
        record
          .map(
            ([key, value]) =>
              '<dt>' + escapeHtml(fieldLabel(key)) + '</dt><dd>' + escapeHtml(value) + '</dd>',
          )
          .join('') +
        '</dl>',
    )
    .join('<hr>');
  return (
    '<article><h2>' +
    escapeHtml(base.name) +
    '</h2><p>' +
    escapeHtml(base.info) +
    '</p>' +
    records +
    '</article>'
  );
}

export function groupExportRecords(results) {
  return groupSearchResults(results).map((base) => ({
    ...base,
    records: base.data.map((fields) => ({ fields })),
  }));
}
export function groupExportFieldArrays(results) {
  return groupSearchResults(results).map((base) => ({ ...base, records: base.data }));
}
