import test from 'node:test';
import assert from 'node:assert/strict';
import { CFB } from 'xlsx/xlsx.mjs';
import { buildReportDocx, getReportFileName } from '../../../src/renderer/services/report/reportExport.js';

function exampleReport(overrides = {}) {
  return {
    seedQuery: { number: '+7 900 000 00 00' }, createdAt: '2026-10-10T10:15:00.000Z',
    complete: true, cancelled: false, warnings: [],
    sources: [
      { id: 'first', name: 'Первый индекс', info: 'Описание первого индекса', server_metadata: { freshness: '2026-10-01' } },
      { id: 'second', name: 'Второй индекс', info: 'Описание второго индекса', trust: 'Не проверен' },
    ],
    queries: [{ id: 'query-1', query: { number: '+7 900 000 00 00' }, status: 'completed', meta: { records: 2 } }],
    records: [{
      id: 'record-1', fields: [['ФИО', 'Иванов Иван Иванович'], ['Телефон', '+7 900 000 00 00'], ['Неизвестное поле', 'Значение']],
      sources: ['first', 'second'], queryIds: ['query-1'], sourceRecordIds: [{ source: 'first', id: 'origin-123' }],
    }],
    identifiers: [{ field: 'passport', value: '1234 567890', sources: ['first'] }],
    stats: { records: 1, queries: 1, sources: 2, identifiers: 1, duplicates: 1, pendingQueries: 0 },
    ...overrides,
  };
}

function unpack(report) {
  const bytes = buildReportDocx(report);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 2)), 'PK');
  const archive = CFB.read(bytes, { type: 'array' });
  const part = (path) => {
    const entry = CFB.find(archive, `/${path}`);
    assert.ok(entry, `Package part ${path} must exist`);
    return new TextDecoder().decode(entry.content);
  };
  return { bytes, archive, part, document: part('word/document.xml') };
}

test('DOCX is a standalone editable OOXML package with A4 pages and page numbers', () => {
  const { archive, part, document } = unpack(exampleReport());
  assert.match(part('[Content_Types].xml'), /wordprocessingml\.document\.main\+xml/);
  assert.match(part('_rels/.rels'), /Target="word\/document\.xml"/);
  assert.match(part('word/_rels/document.xml.rels'), /Target="styles.xml"/);
  assert.match(part('word/_rels/document.xml.rels'), /Target="footer1.xml"/);
  assert.match(document, /<w:pgSz w:w="11906" w:h="16838"\/>/);
  assert.match(document, /w:pStyle w:val="Title"/);
  assert.match(part('word/styles.xml'), /w:color w:val="000000"/);
  assert.doesNotMatch(part('word/styles.xml'), /themeColor|pBdr/);
  assert.match(part('word/footer1.xml'), /w:instr="PAGE"/);
  assert.match(part('word/footer1.xml'), /w:instr="NUMPAGES"/);
  assert.match(part('docProps/core.xml'), /2026-10-10T10:15:00.000Z/);
  assert.ok(archive.FullPaths.every((path) => !/vba|externalLinks|embeddings/i.test(path)));
});

test('report preserves unknown fields, source provenance, query history and identifiers', () => {
  const { document } = unpack(exampleReport());
  for (const value of ['Неизвестное поле', 'Значение', 'Первый индекс', 'Второй индекс', 'Описание первого индекса',
    'И1, И2', 'origin-123', 'З1', '1234 567890', 'Журнал поисковых запросов', 'Полные найденные записи', 'server_metadata', 'freshness']) {
    assert.ok(document.includes(value), value);
  }
  assert.match(document, /Поиск по ФИО и дате рождения не выполняется/);
  assert.match(document, /само по себе не подтверждает/);
});

test('all source metadata survives export, including zero counts and unknown nested properties', () => {
  const { document } = unpack(exampleReport({ sources: [{
    id: 'first', name: 'Индекс', info: 'Описание', trust: 'Не проверен',
    type: 'test-source-type', country: 'test-source-country', count: 0,
    relevance_date: 'test-relevance-date', unknown_metadata: { retained: 'nested-source-value' },
  }] }));
  for (const value of ['test-source-type', 'test-source-country', '0 [число]', 'test-relevance-date',
    'unknown_metadata', 'nested-source-value']) assert.ok(document.includes(value), value);
});

test('server aggregates remain separate from records with zero counts and explicit unknown provenance', () => {
  const { document } = unpack(exampleReport({
    records: [], identifiers: [], aggregates: [
      { id: 'aggregate-1', key: 'city', items: [{ value: 'Тестовый город <А>', count: 0 }, { value: 'Тестовый город Б', count: 7 }], sources: [], queryIds: ['query-1'] },
      { id: 'aggregate-2', key: 'city', items: [{ value: 'Тестовый город Б', count: 3 }], sources: [], queryIds: ['query-1'] },
    ],
  }));
  assert.match(document, /Сводные данные сервера/);
  assert.match(document, /Город \(city\)/);
  assert.match(document, /Тестовый город &lt;А&gt;/);
  assert.match(document, /0 \[число\]/);
  assert.match(document, /7 \[число\]/);
  assert.match(document, /3 \[число\]/);
  assert.match(document, /Источник агрегата сервером не указан\. Запросы: З1\./);
  assert.match(document, /Счётчики разных запросов не суммируются/);
  assert.match(document, /Сводка 1/);
  assert.match(document, /Сводка 2/);
  assert.doesNotMatch(document, /Запись 1/);
  assert.doesNotMatch(document, /Связанные идентификаторы/);
});

test('untrusted source content is plain escaped text including Unicode and XML-invalid characters', () => {
  const report = exampleReport({ records: [{
    id: 'record-1', fields: [['<поле>', 'Кириллица & <w:p> "А" 😀\u0001\uD800\nВторая строка\tТабуляция']],
    sources: ['first'], queryIds: [],
  }] });
  const { document } = unpack(report);
  assert.match(document, /&lt;поле&gt;/);
  assert.match(document, /Кириллица &amp; &lt;w:p&gt; &quot;А&quot; 😀\\u0001\\ud800/);
  assert.match(document, /<w:br\/>/);
  assert.match(document, /<w:tab\/>/);
  assert.doesNotMatch(document, /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800]/u);
});

test('summary combines exact repeated values and preserves distinct values and all complete records', () => {
  const report = exampleReport({
    records: [
      { id: 'record-1', fields: [['Поле', 'Одинаковое'], ['Статус', 'активен']], sources: ['first'], queryIds: ['query-1'] },
      { id: 'record-2', fields: [['Поле', 'Одинаковое'], ['Статус', 'неактивен']], sources: ['second'], queryIds: ['query-1'] },
    ],
  });
  const { document } = unpack(report);
  const summary = document.slice(document.indexOf('Найденные сведения'), document.indexOf('Источники данных</w:t>'));
  assert.equal(summary.split('Одинаковое').length - 1, 1);
  assert.match(summary, /И1, И2/);
  assert.match(summary, /активен/);
  assert.match(summary, /неактивен/);
  assert.match(document, /Запись 1/);
  assert.match(document, /Запись 2/);
  assert.equal(document.split('Одинаковое').length - 1, 3);
});

test('zero, false, empty, null, structured and duplicate-key fields are not lost', () => {
  const { document } = unpack(exampleReport({ records: [{
    id: 'record-1', fields: [['Ноль', 0], ['Флаг', false], ['Пусто', ''], ['Null', null],
      ['Объект', { nested: '<да>', list: [1, 2] }], ['Повтор', 'одно'], ['Повтор', 'другое']],
    sources: ['first'], queryIds: [],
  }] }));
  for (const text of ['0 [число]', 'false [логическое значение]', 'Пустая строка', 'null',
    '&quot;nested&quot;', '&lt;да&gt;', 'одно', 'другое']) assert.ok(document.includes(text), text);
});

test('known server field names have readable labels while original names remain visible', () => {
  const { document } = unpack(exampleReport({ records: [{
    id: 'record-1', fields: [['passport', '0000000000'], ['date_of_birth', '01.01.1990'],
      ['address_registration', 'Тестовая улица'], ['unknown_schema_key', 'Неизвестное значение']], sources: ['first'], queryIds: [],
  }] }));
  assert.match(document, /Паспорт \(passport\)/);
  assert.match(document, /Дата рождения \(date_of_birth\)/);
  assert.match(document, /Адрес регистрации \(address_registration\)/);
  assert.match(document, /unknown_schema_key/);
});

test('cancelled and partial reports state incompleteness and preserve errors and warnings', () => {
  const { document } = unpack(exampleReport({
    complete: false, cancelled: true, warnings: ['Индекс временно недоступен'],
    queries: [{ id: 'query-1', query: { passport: '1234 567890' }, status: 'partial', meta: { truncated: true }, error: 'Сервер не ответил' }],
    stats: { pendingQueries: 4 },
  }));
  assert.match(document, /Сбор остановлен пользователем/);
  assert.match(document, /Ограничения сбора/);
  assert.match(document, /Индекс временно недоступен/);
  assert.match(document, /Частично выполнен/);
  assert.match(document, /Сервер не ответил/);
  assert.match(document, /truncated/);
  assert.match(unpack(exampleReport({ complete: false })).document, /Сбор завершён частично/);
});

test('empty and lengthy reports have honest content and tables that can flow across pages', () => {
  const empty = unpack(exampleReport({ records: [], sources: [], identifiers: [], queries: [] })).document;
  assert.match(empty, /Записи не найдены/);
  assert.match(empty, /Источники с данными отсутствуют/);
  const long = unpack(exampleReport({ records: [{
    id: 'record-1', fields: [['Длинный текст', 'Содержание '.repeat(2000)]], sources: ['first'], queryIds: [],
  }] })).document;
  assert.equal(long.split('Содержание ').length - 1, 4000);
  assert.match(long, /<w:tblHeader\/>/);
  assert.match(long, /w:color="D9D9D9"/);
  assert.match(long, /w:vAlign w:val="center"/);
  assert.doesNotMatch(long, /<w:trHeight|w:hRule="exact"/);
  const bodyRows = long.match(/<w:tr>(?!<w:trPr>)[\s\S]*?<\/w:tr>/g) || [];
  assert.ok(bodyRows.length);
  assert.ok(bodyRows.every((row) => !/cantSplit/.test(row)));
});

test('section introductions stay with their first table while body rows can paginate normally', () => {
  const { document } = unpack(exampleReport());
  const paragraphs = document.match(/<w:p>[\s\S]*?<\/w:p>/g);
  for (const intro of ['Здесь указаны идентификаторы', 'Одинаковые значения внутри одного поля',
    'Записи приведены без сокращения', 'Идентификатор источника: first', 'Описание первого индекса']) {
    const paragraph = paragraphs.find((value) => value.includes(intro));
    assert.ok(paragraph, intro);
    assert.match(paragraph, /<w:keepNext\/>/, intro);
  }
  const queryParagraph = paragraphs.filter((value) => value.includes('Телефон: +7 900 000 00 00')).at(-1);
  assert.match(queryParagraph, /<w:keepNext\/>/);
  const recordValue = paragraphs.find((value) => value.includes('Иванов Иван Иванович'));
  assert.doesNotMatch(recordValue, /<w:keepNext\/>/);
  const secondSourceTrust = paragraphs.find((value) => value.includes('Оценка источника: Не проверен'));
  assert.doesNotMatch(secondSourceTrust, /<w:keepNext\/>/);
});

test('report names are safe Windows filenames and use the Moscow date', () => {
  const name = getReportFileName(exampleReport({ seedQuery: { number: '../CON: <>"/\\|?*\n' }, createdAt: '2026-10-10T22:00:00Z' }));
  assert.match(name, /^Отчёт Matrix 2026-10-11 /);
  assert.match(name, /\.docx$/);
  assert.doesNotMatch(name, /[<>:"/\\|?*\x00-\x1F]/);
  const emojiName = getReportFileName(exampleReport({ seedQuery: { number: '😀'.repeat(100) } }));
  assert.doesNotMatch(emojiName, /[\uD800-\uDFFF]/u);
  assert.match(getReportFileName({}), /без-даты/);
  assert.throws(() => buildReportDocx(null), TypeError);
});
