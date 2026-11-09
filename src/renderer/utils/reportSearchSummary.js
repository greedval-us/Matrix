import { SEARCH_FIELDS } from '../../shared/constants/searchItems.js';
import { REPORT_IDENTIFIER_ALIASES } from '../../shared/constants/reportPolicy.js';
import { key as translatedKeys } from '../../shared/constants/translateKey.js';
import { normalizeReportIdentifier } from '../../shared/utils/reportIdentifiers.js';

const fieldAliases = new Map();
const aliasKey = (value) => String(value).trim().toLowerCase();
const list = (value) => Array.isArray(value) ? value : [];
const wholeTextFields = new Set(['fio', 'date_of_birth']);

for (const { type, label } of SEARCH_FIELDS) {
  fieldAliases.set(type, type);
  fieldAliases.set(aliasKey(label), type);
}
for (const [field, aliases] of Object.entries(REPORT_IDENTIFIER_ALIASES)) {
  for (const alias of aliases) fieldAliases.set(aliasKey(alias), field);
}
// This role is already displayed by the report, but does not extend collection.
fieldAliases.set('work_phone', 'number');
for (const [alias, field] of [...fieldAliases]) {
  if (translatedKeys[alias]) fieldAliases.set(aliasKey(translatedKeys[alias]), field);
}

function searchValues(field, rawValue) {
  if (typeof rawValue !== 'string' && typeof rawValue !== 'number') return [];
  const text = String(rawValue).trim();
  if (!text) return [];
  // Valid identifiers can themselves contain punctuation used by lists, e.g. email local parts.
  const exact = normalizeReportIdentifier(field, text);
  if (exact) return [exact.value];
  const parts = text.split(wholeTextFields.has(field) ? /[;|\r\n]+/ : /[;,|\r\n]+/);
  return parts.flatMap((part) => {
    const value = part.trim();
    if (!value) return [];
    if (wholeTextFields.has(field)) return [value];
    const identifier = normalizeReportIdentifier(field, value);
    if (identifier) return [identifier.value];
    // Try the whole formatted identifier first so a phone is never fragmented.
    const tokens = value.split(/\s+/);
    const identifiers = tokens.map((token) => normalizeReportIdentifier(field, token));
    if (tokens.length > 1 && identifiers.every(Boolean)) return identifiers.map((item) => item.value);
    return [value];
  });
}

/** Found searchable values only; requesting a seed alone is not evidence. */
export function buildReportSearchSummary(report = {}) {
  const groups = new Map();
  const seedKeys = new Set();
  const valueKey = (field, value) => JSON.stringify([field, value]);

  for (const [key, rawValue] of Object.entries(report?.seedQuery || {})) {
    const field = fieldAliases.get(aliasKey(key));
    if (!field) continue;
    for (const value of searchValues(field, rawValue)) seedKeys.add(valueKey(field, value));
  }

  function append(key, rawValue, skipSeed = false) {
    if (typeof key !== 'string') return;
    const field = fieldAliases.get(aliasKey(key));
    if (!field) return;
    for (const value of searchValues(field, rawValue)) {
      if (skipSeed && seedKeys.has(valueKey(field, value))) continue;
      if (!groups.has(field)) groups.set(field, new Set());
      groups.get(field).add(value);
    }
  }

  for (const record of list(report?.records)) {
    for (const pair of list(record?.fields)) {
      if (Array.isArray(pair)) append(pair[0], pair[1]);
    }
  }
  for (const identifier of list(report?.identifiers)) {
    const sourced = list(identifier?.sources).some((source) => source != null && String(source).trim() !== '');
    append(identifier?.field, identifier?.value, !sourced);
  }
  for (const aggregate of list(report?.aggregates)) {
    for (const item of list(aggregate?.items)) append(aggregate?.key, item?.value);
  }

  return [...groups].map(([field, values]) => ({ field, values: [...values] }));
}
