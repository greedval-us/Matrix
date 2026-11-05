import { DEFAULT_REPORT_LIMITS } from '../../../shared/constants/reportPolicy.js';
import { extractReportIdentifiers, normalizeReportSeed, reportIdentifierKey } from '../../../shared/utils/reportIdentifiers.js';

const sourceKey = (value) => String(value || 'unknown');
const addUnique = (values, value) => { if (!values.includes(value)) values.push(value); };

function normalizedLimits(overrides) {
  return Object.fromEntries(Object.entries(DEFAULT_REPORT_LIMITS).map(([key, fallback]) => {
    const value = overrides[key] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Лимит ${key} должен быть положительным целым числом.`);
    return [key, value];
  }));
}

function hitCount(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value);
  return null;
}

function inspectCompleteness(meta, warn, queryId) {
  let partial = false;
  const issue = (message) => { partial = true; warn(`Запрос ${queryId}: ${message}`); };
  const total = hitCount(meta.total_hits);
  const returned = hitCount(meta.returned_hits);
  if (total === null || returned === null) issue('сервер не подтвердил полноту выдачи.');
  else if (total > returned) issue(`получено ${returned} из ${total} записей; API не поддерживает получение следующей страницы.`);
  else if (total < returned) issue('сервер вернул несогласованные счётчики результатов.');
  const indexed = hitCount(meta.indexed_shards);
  const shards = hitCount(meta.total_shards);
  if (meta.partial === true) issue('сервер сообщил о частичной выдаче.');
  if (indexed !== null && shards !== null && indexed < shards)
    issue(`в выдаче учтено частей индекса: ${indexed} из ${shards}.`);
  return partial;
}

export async function collectReport({ seedQuery, search, isCancelled = () => false,
  onProgress = () => {}, limits = {} }) {
  if (typeof search !== 'function') throw new TypeError('Не задана функция поиска для сбора отчёта.');
  const policy = normalizedLimits(limits);
  const seed = normalizeReportSeed(seedQuery);
  const report = {
    seedQuery: seed.query, createdAt: new Date().toISOString(), queries: [], records: [],
    identifiers: [], sources: [], aggregates: [], stats: {}, warnings: [], complete: true, cancelled: false,
  };
  const warnings = new Set();
  const sources = new Map();
  const records = new Map();
  const aggregates = new Map();
  const identifiers = new Map();
  const queue = [];
  let cursor = 0;
  let duplicates = 0;
  let aggregateDuplicates = 0;
  let recordLimitReached = false;
  const recordLimitWarning = `Достигнут лимит записей: ${policy.maxRecords}. Сбор остановлен, часть данных не вошла в отчёт.`;
  const warn = (message) => { warnings.add(message); report.complete = false; };
  const stats = () => ({ queries: report.queries.length, records: records.size, duplicates,
    aggregates: aggregates.size, aggregateDuplicates,
    sources: sources.size, identifiers: identifiers.size, pendingQueries: queue.length - cursor });
  const progress = (type, query) => onProgress({ type, ...(query ? { query } : {}), stats: stats(), warnings: [...warnings] });

  function ensureSource(id) {
    if (!sources.has(id)) sources.set(id, { id, name: id, info: '' });
    return sources.get(id);
  }

  function addIdentifier(identifier, source) {
    const key = reportIdentifierKey(identifier.field, identifier.value);
    let entry = identifiers.get(key);
    if (!entry) {
      entry = { ...identifier, sources: [] };
      identifiers.set(key, entry);
      queue.push({ [identifier.field]: identifier.value });
    }
    if (source) addUnique(entry.sources, source);
  }

  function appendRecord(data, queryId) {
    const source = sourceKey(data.source_name);
    ensureSource(source);
    const rawFields = Object.entries(data.fields || {}).map(([key, value]) => [key, String(value ?? '')]);
    const technicalIds = rawFields.filter(([key]) => key.toLowerCase() === 'id').map(([, value]) => value);
    const fields = rawFields.filter(([key]) => key.toLowerCase() !== 'id');
    const sorted = [...fields].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    // Rows containing only a technical id still retain their distinct source record identity.
    const fingerprint = JSON.stringify(fields.length ? sorted : [source, technicalIds]);
    let record = records.get(fingerprint);
    if (!record) {
      if (records.size >= policy.maxRecords) { recordLimitReached = true; return; }
      record = { id: `record-${records.size + 1}`, fields, sources: [], queryIds: [], sourceRecordIds: [] };
      records.set(fingerprint, record);
    } else duplicates += 1;
    addUnique(record.sources, source);
    addUnique(record.queryIds, queryId);
    for (const id of technicalIds) {
      if (!record.sourceRecordIds.some((item) => item.source === source && item.id === id)) {
        record.sourceRecordIds.push({ source, id });
      }
    }
    for (const [key, value] of fields) {
      for (const identifier of extractReportIdentifiers(key, value)) addIdentifier(identifier, source);
    }
  }

  function appendAggregate(data, queryId) {
    const key = String(data.key ?? '');
    const items = (data.item || []).map((item) => ({ value: String(item.value ?? ''), count: item.count ?? 0 }));
    // Counts describe this server response, so they must never be added across queries.
    const fingerprint = JSON.stringify([key, items.map(({ value, count }) => JSON.stringify([value, count])).sort()]);
    let aggregate = aggregates.get(fingerprint);
    if (!aggregate) {
      // ObjectGrouped has no source field in the current proto. A neighbouring
      // DataBase message cannot establish ownership of a request-wide aggregate.
      aggregate = { id: `aggregate-${aggregates.size + 1}`, key, items, sources: [], queryIds: [] };
      aggregates.set(fingerprint, aggregate);
    } else aggregateDuplicates += 1;
    addUnique(aggregate.queryIds, queryId);
  }

  function append(items, query) {
    if (!Array.isArray(items) || isCancelled()) return;
    for (const item of items) {
      if (isCancelled()) break;
      if (item.object_data) appendRecord(item.object_data, query.id);
      else if (item.object_grouped) appendAggregate(item.object_grouped, query.id);
      else if (item.object_data_base) {
        const { name_table, name, info, ...metadata } = item.object_data_base;
        const id = sourceKey(name_table);
        Object.assign(ensureSource(id), metadata, { id, name: name || id, info: info || '' });
      } else if (item.object_add_search) {
        for (const field of item.object_add_search.item || []) {
          for (const identifier of extractReportIdentifiers(field.key, field.value)) addIdentifier(identifier);
        }
      } else if (item.meta) Object.assign(query.meta, item.meta);
    }
    progress('query-progress', query);
  }

  for (const [field, value] of Object.entries(seed.query)) addIdentifier({ field, value });
  for (const field of seed.invalidFields) warn(`Исходное поле «${field}» не использовано: требуется точный идентификатор без масок.`);
  progress('started');

  while (cursor < queue.length) {
    if (isCancelled()) { report.cancelled = true; break; }
    if (report.queries.length >= policy.maxQueries) {
      warn(`Достигнут лимит запросов: ${policy.maxQueries}. Не все найденные идентификаторы проверены.`);
      break;
    }
    if (recordLimitReached || (records.size >= policy.maxRecords && report.queries.length > 0)) {
      warn(recordLimitWarning);
      break;
    }
    const query = { id: `query-${report.queries.length + 1}`, query: queue[cursor++], status: 'running', meta: {} };
    report.queries.push(query);
    progress('query-started', query);
    try {
      const response = await search(query.query, { onChunk: (items) => append(items, query) });
      Object.assign(query.meta, response?.meta || {});
      if (isCancelled() || query.meta.cancelled) {
        query.status = 'cancelled';
        report.cancelled = true;
      } else query.status = inspectCompleteness(query.meta, warn, query.id) ? 'partial' : 'completed';
    } catch (error) {
      if (isCancelled()) { query.status = 'cancelled'; report.cancelled = true; }
      else {
        query.status = 'failed';
        query.error = error?.message || String(error);
        warn(`Запрос ${query.id} завершился с ошибкой: ${query.error}`);
      }
    }
    progress('query-completed', query);
    if (report.cancelled) break;
  }
  if (recordLimitReached) warn(recordLimitWarning);
  if (report.cancelled || isCancelled()) {
    report.cancelled = true;
    warn('Сбор отчёта остановлен пользователем. Уже полученные данные сохранены.');
  }
  report.records = [...records.values()];
  report.identifiers = [...identifiers.values()];
  report.sources = [...sources.values()];
  report.aggregates = [...aggregates.values()];
  report.stats = stats();
  report.warnings = [...warnings];
  progress('finished');
  return report;
}
