export const ALL_SOURCE_TYPES = 'Все';
export const UNKNOWN_SOURCE_TYPE = 'Неизвестно';
export const SORT_ASCENDING = 'asc';
export const SORT_DESCENDING = 'desc';
export const CATALOG_COLUMNS = Object.freeze([
  { key: 'name', label: 'Источник' }, { key: 'info', label: 'Описание' },
  { key: 'relevance_date', label: 'Актуальность' }, { key: 'type', label: 'Тип' },
  { key: 'count', label: 'Записей' }, { key: 'trust', label: 'Доступность' },
]);
export const getCatalogCount = (value) => parseInt(value) || 0;
export function getCatalogTypes(rows) {
  return [ALL_SOURCE_TYPES, ...Array.from(new Set(rows.map((row) => row.type ?? UNKNOWN_SOURCE_TYPE))).sort()];
}
export function selectCatalogRows(rows, { selectedType, sortKey, sortDirection }) {
  const selected = selectedType === ALL_SOURCE_TYPES ? [...rows] : rows.filter((row) => (row.type ?? UNKNOWN_SOURCE_TYPE) === selectedType);
  if (!sortKey) return selected;
  const direction = sortDirection === SORT_ASCENDING ? 1 : -1;
  return selected.sort((left, right) => direction * (sortKey === 'count'
    ? getCatalogCount(left.count) - getCatalogCount(right.count)
    : String(left[sortKey] ?? '').localeCompare(String(right[sortKey] ?? ''))));
}
export const sumCatalogCounts = (rows) => rows.reduce((sum, row) => sum + getCatalogCount(row.count), 0);
