import { nonEmptyResultFields } from '../../shared/utils/resultFields.js';

function canonicalValue(value) {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array', value.map(canonicalValue)];
  if (typeof value === 'object') {
    return ['object', Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])])];
  }
  if (typeof value === 'number' && Object.is(value, -0)) return ['number', '-0'];
  return [typeof value, String(value)];
}

/** Group only identical complete field bundles, preserving each record's relationships. */
export function groupReportRecords(records = []) {
  const groups = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const rawFields = Array.isArray(record?.fields) ? record.fields.filter(Array.isArray) : [];
    const fields = [];
    const pairIds = new Set();

    for (const [key, value] of nonEmptyResultFields(rawFields)) {
      const pairId = JSON.stringify([canonicalValue(key), canonicalValue(value)]);
      if (pairIds.has(pairId)) continue;
      pairIds.add(pairId);
      fields.push([key, value]);
    }
    if (fields.length === 0) continue;

    const fingerprint = JSON.stringify([...pairIds].sort());
    if (!groups.has(fingerprint)) groups.set(fingerprint, { group: { fields, sources: [] }, sourceIds: new Set() });
    const { group, sourceIds } = groups.get(fingerprint);

    for (const rawSource of Array.isArray(record?.sources) ? record.sources : []) {
      if (rawSource == null) continue;
      const source = String(rawSource);
      if (source.trim() === '' || sourceIds.has(source)) continue;
      sourceIds.add(source);
      group.sources.push(source);
    }
  }

  return [...groups.values()].map(({ group }) => group);
}
