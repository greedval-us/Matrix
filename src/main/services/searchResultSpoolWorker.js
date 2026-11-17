import { DatabaseSync } from 'node:sqlite';
import { parentPort, workerData } from 'node:worker_threads';

const database = new DatabaseSync(workerData);
database.exec(`
  PRAGMA journal_mode = MEMORY;
  PRAGMA synchronous = OFF;
  PRAGMA cache_size = -8192;
  CREATE TABLE results (
    source TEXT NOT NULL,
    position INTEGER NOT NULL,
    fields TEXT NOT NULL,
    PRIMARY KEY (source, position)
  ) WITHOUT ROWID;
`);
const insert = database.prepare('INSERT INTO results VALUES (?, ?, ?)');
const select = database.prepare(`
  SELECT fields FROM results WHERE source = ? AND position >= ? ORDER BY position LIMIT ?
`);
const sources = new Map();
const columns = new Map();
let recordCount = 0;
let fieldLabels = {};
let suggestions = [];

function append(entries) {
  const updates = new Map();
  let nextFieldLabels = fieldLabels;
  let nextSuggestions = suggestions;
  let added = 0;
  database.exec('BEGIN');
  try {
    for (const item of entries) {
      if (item.type === 'object_add_search') {
        nextSuggestions = item.fields;
        continue;
      }
      if (item.type !== 'object_data' && item.type !== 'object_data_base') continue;
      const key = item.source || 'unknown';
      if (!updates.has(key)) {
        const source = sources.get(key) ?? { source: key, name: key, recordCount: 0 };
        updates.set(key, { source: { ...source }, names: new Set() });
      }
      const { source, names } = updates.get(key);
      if (item.type === 'object_data_base') {
        const { fieldLabels: labels, ...metadata } = item;
        if (labels) nextFieldLabels = labels;
        Object.assign(source, metadata, { source: key, name: metadata.name || key });
        continue;
      }
      insert.run(key, source.recordCount, JSON.stringify(item.fields));
      for (const [name, value] of item.fields) {
        if (value != null && (typeof value !== 'string' || value.trim() !== '')) names.add(name);
      }
      source.recordCount += 1;
      added += 1;
    }
    database.exec('COMMIT');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    if (error.errcode === 13) throw new Error('На диске закончилось место для результатов поиска');
    throw error;
  }
  for (const [key, { source, names }] of updates) {
    sources.set(key, source);
    if (!columns.has(key)) columns.set(key, names);
    else for (const name of names) columns.get(key).add(name);
  }
  fieldLabels = nextFieldLabels;
  suggestions = nextSuggestions;
  recordCount += added;
}

const operations = {
  append,
  summary: () => ({ recordCount, sources: [...sources.values()], fieldLabels, suggestions }),
  columns: source => [...(columns.get(source) ?? [])],
  read: (source, start, limit) => select.all(source, start, limit).map(row => JSON.parse(row.fields)),
};

parentPort.on('message', ({ id, method, args }) => {
  try { parentPort.postMessage({ id, result: operations[method](...args) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
