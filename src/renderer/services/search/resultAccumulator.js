import { ResultParser, createRecordFingerprint } from '../../utils/ResultParser.js';
export function createResultAccumulator({ deduplicate = true } = {}) {
  const parser = new ResultParser();
  const fingerprints = new Set();
  return {
    append(items) {
      if (!Array.isArray(items)) return [];
      const normalized = [];
      for (const raw of items) {
        const item = parser.parse(raw);
        if (deduplicate && item.type === 'object_data') {
          const fingerprint = JSON.stringify([item.source, createRecordFingerprint(item.fields)]);
          if (fingerprints.has(fingerprint)) continue;
          fingerprints.add(fingerprint);
        }
        normalized.push(item);
      }
      return normalized;
    },
  };
}
