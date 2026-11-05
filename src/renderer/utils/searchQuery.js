import { SEARCH_FIELD_IDS, getSearchField } from '../../shared/constants/searchItems.js';
import { Field } from './Field.js';
export function createSearchField(type) {
  const definition = getSearchField(type);
  if (!definition) return null;
  const field = new Field(type, '', definition.pattern);
  field.placeholder = definition.placeholder;
  return field;
}
export function buildSearchQuery(selectedFields = {}) {
  return Object.fromEntries(SEARCH_FIELD_IDS.map((type) => [type, selectedFields[type]?.value ?? '']));
}
export const hasSearchValues = (query) => Object.values(query).some((value) => String(value).trim());
export const getQueryTitle = (query) => Object.values(query).filter(Boolean).join(', ');
// Preserve whitespace and duplicate rows: each nonempty row is a separate request.
export function parseBatchQueries(value) {
  return String(value ?? '').split(/\r?\n/).filter((line) => line.trim());
}
export const MAX_EXPORT_FILENAME_LENGTH = 120;
export function safeFileName(value, fallback) {
  const name = String(value || '').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').slice(0, MAX_EXPORT_FILENAME_LENGTH);
  return name || fallback;
}
