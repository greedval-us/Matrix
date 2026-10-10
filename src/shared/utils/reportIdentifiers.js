import { getSearchField } from '../constants/searchItems.js';
import { REPORT_IDENTIFIER_ALIASES } from '../constants/reportPolicy.js';

const aliases = new Map(Object.entries(REPORT_IDENTIFIER_ALIASES)
  .flatMap(([field, names]) => names.map((name) => [name, field])));
const numericFields = new Set(['passport', 'inn', 'snils', 'telegram', 'vk', 'imei', 'imsi']);

export const reportIdentifierKey = (field, value) => JSON.stringify([field, value]);

export function normalizeReportIdentifier(key, rawValue) {
  const field = aliases.get(String(key).trim().toLowerCase());
  if (!field || (typeof rawValue !== 'string' && typeof rawValue !== 'number')) return null;
  let value = String(rawValue).trim();
  if (!value || /[?%*\u0000-\u001F]/.test(value)) return null;
  if (field === 'number') {
    if (!/^\+?[\d\s().-]+$/.test(value)) return null;
    value = value.replace(/[+\s().-]/g, '');
  } else if (numericFields.has(field)) {
    if (!/^[\d\s-]+$/.test(value)) return null;
    value = value.replace(/[\s-]/g, '');
  } else if (field === 'vin' || field === 'grz') {
    value = value.replace(/\s/g, '').toUpperCase();
  } else if (field === 'mail') {
    const separator = value.lastIndexOf('@');
    if (separator !== -1) value = value.slice(0, separator) + value.slice(separator).toLowerCase();
  }
  const definition = getSearchField(field);
  return definition && new RegExp(definition.pattern).test(value) ? { field, value } : null;
}

export function extractReportIdentifiers(key, rawValue) {
  const exact = normalizeReportIdentifier(key, rawValue);
  if (exact) return [exact];
  if (typeof rawValue !== 'string') return [];
  // A cell can explicitly list several identifiers. Each part must pass the same exact validation.
  return rawValue.split(/[;,|\r\n]+/)
    .map((value) => normalizeReportIdentifier(key, value)).filter(Boolean);
}

export function normalizeReportSeed(seedQuery) {
  const seed = new Map();
  const invalidFields = [];
  for (const [key, value] of Object.entries(seedQuery || {})) {
    if (!aliases.has(String(key).trim().toLowerCase()) || !String(value ?? '').trim()) continue;
    const identifier = normalizeReportIdentifier(key, value);
    if (identifier) seed.set(identifier.field, identifier.value);
    else invalidFields.push(key);
  }
  if (!seed.size) {
    throw new Error('Для сбора отчёта укажите точный телефон, документ, email или другой идентификатор. ФИО, дата рождения и маски в сборе отчёта не используются.');
  }
  return { query: Object.fromEntries(seed), invalidFields };
}

export const getReportSeedQuery = (seedQuery) => normalizeReportSeed(seedQuery).query;
export const canonicalizeReportIdentifier = (field, value) => normalizeReportIdentifier(field, value)?.value ?? null;
