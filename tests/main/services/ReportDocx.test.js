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

test('complete report starts with the query and date and contains only found values and human source names', () => {
  const { document } = unpack(exampleReport());
  for (const value of ['Телефон: +7 900 000 00 00', '10 октября 2026', '13:15', 'МСК',
    'Неизвестное поле', 'Значение', 'Первый индекс, Второй индекс']) {
    assert.ok(document.includes(value), value);
  }
  assert.equal(document.match(/<w:tbl>/g)?.length, 1);
  assert.match(document, /<w:t xml:space="preserve">Поле<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">Значение<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">Источники<\/w:t>/);
  assert.ok(document.indexOf('Телефон: +7 900 000 00 00') < document.indexOf('<w:tbl>'));
  assert.ok(document.indexOf('10 октября 2026') < document.indexOf('<w:tbl>'));
  assert.doesNotMatch(document, /Сбор завершён|Сбор завершён частично|Ограничения сбора|Поиск по ФИО|само по себе не подтверждает/);
  assert.doesNotMatch(document, /Результаты сбора|Уникальных записей|Связанные идентификаторы|Источники данных|Полные найденные записи|Журнал поисковых запросов/);
  assert.doesNotMatch(document, /И1|З1|first|record-1|origin-123|query-1|1234 567890|server_metadata|freshness|Описание первого индекса/);
});

test('source names fall back to source ids and missing provenance is explicit without exporting source metadata', () => {
  const { document } = unpack(exampleReport({ sources: [{
    id: 'first', name: '', info: 'Описание', trust: 'Не проверен',
    type: 'test-source-type', country: 'test-source-country', count: 0,
    relevance_date: 'test-relevance-date', unknown_metadata: { retained: 'nested-source-value' },
  }], records: [
    { fields: [['Первое поле', 'Первое значение']], sources: ['first', 'missing-source'] },
    { fields: [['Второе поле', 'Второе значение']], sources: [] },
  ] }));
  assert.match(document, /first, missing-source/);
  assert.match(document, /Не указан/);
  assert.doesNotMatch(document, /test-source-type|test-source-country|test-relevance-date|unknown_metadata|nested-source-value|Не проверен|Описание/);
});

test('server aggregates remain separate from records with zero counts and explicit unknown provenance', () => {
  const { document } = unpack(exampleReport({
    records: [], identifiers: [], aggregates: [
      { id: 'aggregate-1', key: 'city', items: [{ value: 'Тестовый город <А>', count: 0 }, { value: 'Тестовый город Б', count: 7 }], sources: [], queryIds: ['query-1'] },
      { id: 'aggregate-2', key: 'city', items: [{ value: 'Тестовый город Б', count: 3 }], sources: [], queryIds: ['query-1'] },
    ],
  }));
  assert.match(document, /Сводные данные сервера/);
  assert.match(document, /Город/);
  assert.match(document, /Тестовый город &lt;А&gt;/);
  for (const count of ['0', '7', '3']) assert.ok(document.includes(`<w:t xml:space="preserve">${count}</w:t>`));
  assert.match(document, /Источник сводных данных не указан/);
  assert.equal(document.match(/<w:tbl>/g)?.length, 1);
  assert.equal(document.match(/Тестовый город Б/g)?.length, 2);
  assert.doesNotMatch(document, /Данные не найдены|Запись 1|Связанные идентификаторы|Сводка [12]|query-1|aggregate-1|З1|\(city\)|\[число\]/);
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

test('summary emits exact repeated field values once and merges human source names in encounter order', () => {
  const report = exampleReport({
    records: [
      { id: 'record-1', fields: [['Поле', 'Одинаковое'], ['Статус', 'активен']], sources: ['first'], queryIds: ['query-1'] },
      { id: 'record-2', fields: [['Поле', 'Одинаковое'], ['Статус', 'неактивен']], sources: ['second'], queryIds: ['query-1'] },
    ],
  });
  const { document } = unpack(report);
  assert.equal(document.split('Одинаковое').length - 1, 1);
  assert.match(document, /Первый индекс, Второй индекс/);
  assert.match(document, />активен<\/w:t>/);
  assert.match(document, />неактивен<\/w:t>/);
  assert.equal(document.match(/<w:tbl>/g)?.length, 1);
  const rows = document.match(/<w:tr>[\s\S]*?<\/w:tr>/g);
  assert.equal(rows.length, 4);
  assert.ok(rows[1].includes('Поле') && rows[1].includes('Одинаковое'));
  assert.ok(rows[2].includes('Статус') && rows[2].includes('>активен<'));
  assert.ok(rows[3].includes('Статус') && rows[3].includes('>неактивен<'));
});

test('exact typed values remain distinct while duplicate source names are merged once per value', () => {
  const { document } = unpack(exampleReport({
    sources: [{ id: 'first', name: 'Общий источник' }, { id: 'second', name: 'Общий источник' }],
    records: [
      { fields: [['Ноль', 0], ['Ноль', '0'], ['Флаг', false], ['Флаг', 'false']], sources: ['first'] },
      { fields: [['Ноль', 0], ['Флаг', false]], sources: ['second'] },
    ],
  }));
  assert.equal(document.match(/<w:tr>/g)?.length, 5);
  assert.equal(document.match(/>0<\/w:t>/g)?.length, 2);
  assert.equal(document.match(/>false<\/w:t>/g)?.length, 2);
  assert.equal(document.match(/Общий источник/g)?.length, 4);
  assert.doesNotMatch(document, /Общий источник, Общий источник/);
});

test('different raw fields sharing a readable label retain their own values', () => {
  const { document } = unpack(exampleReport({ records: [{
    fields: [['number_work', 'Совпадающее значение'], ['number_house', 'Совпадающее значение']], sources: ['first'],
  }] }));
  assert.equal(document.match(/<w:tr>/g)?.length, 3);
  assert.equal(document.match(/Совпадающее значение/g)?.length, 2);
  assert.equal(document.match(/Номер телефона/g)?.length, 2);
  assert.doesNotMatch(document, /number_work|number_house/);
});

test('summary omits blank fields while preserving zero, false, structured values and distinct duplicate-key values', () => {
  const report = exampleReport({ records: [{
    id: 'record-1', fields: [['Ноль', 0], ['Флаг', false], ['blank-empty', ''], ['blank-null', null],
      ['blank-undefined', undefined], ['blank-whitespace', ' \t\r\n '],
      ['Объект', { nested: '<да>', list: [1, 2], blank: null }], ['Массив', []], ['Пустой объект', {}],
      ['Повтор', 'одно'], ['Повтор', 'другое'], ['Повтор', '']],
    sources: ['first'], queryIds: [],
  }] });
  const original = structuredClone(report);
  const { document } = unpack(report);
  for (const label of ['blank-empty', 'blank-null', 'blank-undefined', 'blank-whitespace']) {
    assert.ok(!document.includes(label), label);
  }
  for (const text of ['>0</w:t>', '>false</w:t>', '&quot;nested&quot;', '&lt;да&gt;',
    '&quot;blank&quot;: null', '[]', '{}', 'одно', 'другое']) assert.ok(document.includes(text), text);
  assert.equal(document.split('Повтор').length - 1, 2);
  assert.doesNotMatch(document, /Пустая строка|Не задано|\[число\]|\[логическое значение\]/);
  assert.deepEqual(report, original);
});

test('blank-only records leave the DTO intact and produce a short table-free empty report', () => {
  const report = exampleReport({ records: [{
    id: 'record-1', fields: [['blank-empty', ''], ['blank-null', null], ['blank-undefined', undefined], ['blank-whitespace', ' \n\t ']],
    sources: ['first'], queryIds: ['query-1'], sourceRecordIds: [{ source: 'first', id: 'origin-blank' }],
  }] });
  const original = structuredClone(report);
  const { document } = unpack(report);
  assert.doesNotMatch(document, /<w:tbl>|blank-|origin-blank|Уникальных записей|Запись 1/);
  assert.match(document, /Данные не найдены/);
  assert.deepEqual(report, original);
});

test('missing and null field collections produce the same honest empty report', () => {
  for (const fields of [undefined, null]) {
    const { document } = unpack(exampleReport({ records: [{
      id: 'record-1', fields, sources: ['first'], queryIds: [],
    }] }));
    assert.match(document, /Данные не найдены/);
    assert.doesNotMatch(document, /<w:tbl>/);
  }
});

test('known fields use readable labels without raw key suffixes and unknown names survive unchanged', () => {
  const { document } = unpack(exampleReport({ records: [{
    id: 'record-1', fields: [['passport', '0000000000'], ['date_of_birth', '01.01.1990'],
      ['address_registration', 'Тестовая улица'], ['unknown_schema_key', 'Неизвестное значение']], sources: ['first'], queryIds: [],
  }] }));
  assert.match(document, /Паспорт/);
  assert.match(document, /Дата рождения/);
  assert.match(document, /Адрес регистрации/);
  assert.match(document, /unknown_schema_key/);
  assert.doesNotMatch(document, /\(passport\)|\(date_of_birth\)|\(address_registration\)/);
});

test('cancelled and partial reports state incompleteness and preserve errors and warnings', () => {
  const { document } = unpack(exampleReport({
    complete: false, cancelled: true, warnings: ['Индекс временно недоступен', 'Индекс временно недоступен',
      'Запрос query-1 завершился с ошибкой: Сервер не ответил',
      'Сбор отчёта остановлен пользователем. Уже полученные данные сохранены.'],
    queries: [{ id: 'query-1', query: { passport: '1234 567890' }, status: 'partial', meta: { truncated: true }, error: 'Сервер не ответил' }],
    stats: { pendingQueries: 4 },
  }));
  assert.match(document, /Сбор остановлен пользователем/);
  assert.equal(document.match(/Индекс временно недоступен/g)?.length, 1);
  assert.equal(document.match(/Сервер не ответил/g)?.length, 1);
  assert.doesNotMatch(document, /query-1|Запросы:|1234 567890|Частично выполнен|truncated|Уже полученные данные сохранены|Журнал/);
  assert.match(unpack(exampleReport({ complete: false })).document, /Сбор завершён частично/);
});

test('partial query warnings become unique human causes without query identifiers', () => {
  const { document } = unpack(exampleReport({ complete: false, warnings: [
    'Запрос query-1: сервер сообщил о частичной выдаче.',
    'Запрос query-2: сервер сообщил о частичной выдаче.',
  ], queries: [{ id: 'query-1' }, { id: 'query-2' }, { id: 'query-3', error: 'Отдельная ошибка' }] }));
  assert.equal(document.match(/сервер сообщил о частичной выдаче/g)?.length, 1);
  assert.equal(document.match(/Отдельная ошибка/g)?.length, 1);
  assert.doesNotMatch(document, /query-[123]|Запрос query/);
});

test('empty and lengthy reports have honest content and tables that can flow across pages', () => {
  const empty = unpack(exampleReport({ records: [], sources: [], identifiers: [], queries: [] })).document;
  assert.match(empty, /Данные не найдены/);
  assert.doesNotMatch(empty, /<w:tbl>/);
  const onlySeed = unpack(exampleReport({ records: [], sources: [], queries: [] })).document;
  assert.match(onlySeed, /Данные не найдены/);
  assert.doesNotMatch(onlySeed, /1234 567890|<w:tbl>/);
  const long = unpack(exampleReport({ records: [{
    id: 'record-1', fields: [['Длинный текст', 'Содержание '.repeat(2000)]], sources: ['first'], queryIds: [],
  }] })).document;
  assert.equal(long.split('Содержание ').length - 1, 2000);
  assert.match(long, /<w:tblHeader\/>/);
  assert.match(long, /w:color="D9D9D9"/);
  assert.match(long, /w:vAlign w:val="top"/);
  assert.doesNotMatch(long, /<w:trHeight|w:hRule="exact"/);
  const bodyRows = long.match(/<w:tr>(?!<w:trPr>)[\s\S]*?<\/w:tr>/g) || [];
  assert.ok(bodyRows.length);
  assert.ok(bodyRows.every((row) => !/cantSplit/.test(row)));
});

test('table headers stay with their rows while body values can paginate normally', () => {
  const { document } = unpack(exampleReport());
  const paragraphs = document.match(/<w:p>[\s\S]*?<\/w:p>/g);
  const tableHeader = paragraphs.find((value) => value.includes('>Источники</w:t>'));
  assert.match(tableHeader, /<w:keepNext\/>/);
  const recordValue = paragraphs.find((value) => value.includes('Иванов Иван Иванович'));
  assert.doesNotMatch(recordValue, /<w:keepNext\/>/);
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
