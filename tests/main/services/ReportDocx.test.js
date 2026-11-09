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
    identifiers: [],
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

function tableRows(document) {
  return document.match(/<w:tr>[\s\S]*?<\/w:tr>/g) || [];
}

function tables(document) {
  return document.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
}

function databaseRows(document) {
  return tableRows(tables(document).find((table) => table.includes('>База данных</w:t>')) || '');
}

function summaryRows(document) {
  return tableRows(tables(document).find((table) => table.includes('>Все найденные значения</w:t>')) || '');
}

function cells(row) {
  return row.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
}

function cellText(cell) {
  return [...cell.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)].map(([, value]) => value).join('');
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

test('complete report presents the typed found values before data associated with each database', () => {
  const { document } = unpack(exampleReport());
  for (const value of ['Телефон: +7 900 000 00 00', '10 октября 2026', '13:15', 'МСК',
    'Неизвестное поле', 'Значение', 'Первый индекс', 'Второй индекс',
    'Найденные поисковые значения', 'Данные по базам']) {
    assert.ok(document.includes(value), value);
  }
  assert.equal(tables(document).length, 2);
  assert.match(document, /<w:t xml:space="preserve">Поле<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">Все найденные значения<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">Связанные данные<\/w:t>/);
  assert.match(document, /<w:t xml:space="preserve">База данных<\/w:t>/);
  assert.ok(document.indexOf('Телефон: +7 900 000 00 00') < document.indexOf('<w:tbl>'));
  assert.ok(document.indexOf('10 октября 2026') < document.indexOf('<w:tbl>'));
  assert.ok(document.indexOf('Найденные поисковые значения') < document.indexOf('<w:tbl>'));
  assert.ok(document.indexOf('</w:tbl>') < document.indexOf('Данные по базам'));
  assert.doesNotMatch(document, /Сбор завершён|Сбор завершён частично|Ограничения сбора|Поиск по ФИО|само по себе не подтверждает/);
  assert.doesNotMatch(document, /Результаты сбора|Уникальных записей|Связанные идентификаторы|Источники данных|Полные найденные записи|Журнал поисковых запросов/);
  assert.doesNotMatch(document, /И1|З1|first|record-1|origin-123|query-1|1234 567890|server_metadata|freshness|Описание первого индекса/);
  assert.equal(databaseRows(document).length, 3);
  assert.equal(document.match(/Первый индекс/g)?.length, 1);
  assert.equal(document.match(/Второй индекс/g)?.length, 1);
  assert.match(document, /<w:gridCol w:w="2200"\/><w:gridCol w:w="7438"\/>/);
  assert.match(document, /<w:gridCol w:w="2300"\/><w:gridCol w:w="7338"\/>/);
});

test('the first table groups all found search values by canonical type and deduplicates aliases', () => {
  const { document } = unpack(exampleReport({
    seedQuery: { number: '79999999999' },
    records: [
      { fields: [['number_work', '+7 (900) 000-00-01'], ['mail', 'a@EXAMPLE.TEST'], ['fio', 'Иванов Иван'], ['unknown', 'Только в базе']], sources: ['first'] },
      { fields: [['phone_house', '79000000001'], ['phone_mob', '79000000002'], ['email', 'a@example.test'], ['date_of_birth', '01.01.1990']], sources: ['second'] },
    ],
    identifiers: [{ field: 'passport', value: '1234 567890', sources: ['first'] },
      { field: 'number', value: '79999999999', sources: [] }],
  }));
  const summary = summaryRows(document).slice(1).map((row) => cells(row).map(cellText));
  assert.deepEqual(summary, [
    ['Телефон', '79000000001; 79000000002'], ['Email', 'a@example.test'],
    ['ФИО', 'Иванов Иван'], ['Дата рождения', '01.01.1990'], ['Паспорт', '1234567890'],
  ]);
  assert.doesNotMatch(tables(document)[0], /unknown|Только в базе|79999999999|Рабочий телефон|Домашний телефон/);
  assert.match(tables(document)[1], /Только в базе/);
  assert.equal(tables(document).length, 2);
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
  assert.deepEqual(databaseRows(document).slice(1).map((row) => cells(row).map(cellText)), [
    ['first', 'Первое поле: Первое значение'], ['missing-source', 'Первое поле: Первое значение'],
    ['База не указана', 'Второе поле: Второе значение'],
  ]);
  assert.match(document, /Поисковые значения не найдены/);
  assert.doesNotMatch(document, /test-source-type|test-source-country|test-relevance-date|unknown_metadata|nested-source-value|Не проверен|Описание/);
});

test('server aggregates keep independent values and zero counts inside the database table', () => {
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
  assert.match(document, /База не указана/);
  assert.equal(document.match(/<w:tbl>/g)?.length, 1);
  assert.equal(document.match(/Тестовый город Б/g)?.length, 2);
  assert.doesNotMatch(document, /Данные не найдены|Запись 1|Связанные идентификаторы|Сводка [12]|query-1|aggregate-1|З1|\(city\)|\[число\]/);
  assert.equal(databaseRows(document).length, 4);
  assert.match(document, /Поисковые значения не найдены/);
});

test('recognized aggregate values join the first table while aggregate counts never become record relationships', () => {
  const { document } = unpack(exampleReport({ records: [
    { fields: [['fio', 'Иванов Иван'], ['number', '79000000001']], sources: ['first'] },
  ], aggregates: [
    { key: 'phone_mob', items: [{ value: '79000000002', count: 0 }, { value: '79000000003', count: false }], sources: [] },
  ] }));
  assert.equal(tables(document).length, 2);
  const summary = summaryRows(document).map(cellText).join('|');
  assert.match(summary, /79000000001; 79000000002; 79000000003/);
  const rows = databaseRows(document).slice(1).map((row) => cells(row).map(cellText));
  assert.deepEqual(rows[0], ['Первый индекс', 'ФИО: Иванов ИванТелефон: 79000000001']);
  assert.equal(rows.length, 3);
  assert.ok(rows.slice(1).every(([source, data]) => source === 'База не указана' && data.includes('Сводные данные сервера')));
  assert.match(rows[1][1], /Значение: 79000000002Количество: 0/);
  assert.match(rows[2][1], /Значение: 79000000003Количество: false/);
  assert.doesNotMatch(rows[0][1], /79000000002|79000000003/);
});

test('aggregate-only recognized values still produce the typed and database tables', () => {
  const { document } = unpack(exampleReport({ records: [], aggregates: [
    { key: 'mail', items: [{ value: 'a@example.test', count: 2 }], sources: [] },
  ] }));
  assert.equal(tables(document).length, 2);
  assert.deepEqual(summaryRows(document).slice(1).map((row) => cells(row).map(cellText)), [
    ['Email', 'a@example.test'],
  ]);
  assert.deepEqual(databaseRows(document).slice(1).map((row) => cells(row).map(cellText)), [
    ['База не указана', 'Сводные данные сервераПоле: EmailЗначение: a@example.testКоличество: 2'],
  ]);
});

test('found suggestions without source records get a summary without fabricated database associations', () => {
  const { document } = unpack(exampleReport({ records: [], identifiers: [
    { field: 'mail', value: 'a@example.test', sources: [] },
  ] }));
  assert.equal(tables(document).length, 1);
  assert.deepEqual(summaryRows(document).slice(1).map((row) => cells(row).map(cellText)), [
    ['Email', 'a@example.test'],
  ]);
  assert.equal(databaseRows(document).length, 0);
  assert.match(document, /Связанные данные по базам не получены/);
  assert.doesNotMatch(document, /База не указана|Данные не найдены/);
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

test('each row keeps an exact FIO, birth date and phone bundle with its own provenance', () => {
  const report = exampleReport({
    sources: [...exampleReport().sources, { id: 'third', name: 'Третий индекс' }],
    records: [
      { fields: [['number', '79000000001'], ['date_of_birth', '01.01.1990'], ['fio', 'Иванов Иван Иванович']], sources: ['first'] },
      { fields: [['fio', 'Петров Пётр Петрович'], ['date_of_birth', '02.02.1992'], ['number', '79000000002']], sources: ['third'] },
      { fields: [['fio', 'Иванов Иван Иванович'], ['number', '79000000001'], ['date_of_birth', '01.01.1990']], sources: ['second'] },
      { fields: [['fio', 'Иванов Иван Иванович'], ['date_of_birth', '01.01.1990'], ['number', '79000000003']], sources: ['first'] },
      { fields: [['fio', 'Иванов Иван Иванович'], ['date_of_birth', '03.03.1993'], ['number', '79000000001']], sources: ['second'] },
      { fields: [['fio', 'Иванов Иван Иванович'], ['number', '79000000001']], sources: ['third'] },
      { fields: [['fio', 'Иванов Иван Иванович'], ['number', '79000000001']], sources: ['third'] },
    ],
  });
  const original = structuredClone(report);
  const { document } = unpack(report);
  assert.equal(tables(document).length, 2);
  const rows = databaseRows(document).slice(1).map((row) => cells(row).map(cellText));
  assert.deepEqual(rows, [
    ['Первый индекс', 'ФИО: Иванов Иван ИвановичДата рождения: 01.01.1990Телефон: 79000000001'],
    ['Второй индекс', 'ФИО: Иванов Иван ИвановичДата рождения: 01.01.1990Телефон: 79000000001'],
    ['Третий индекс', 'ФИО: Петров Пётр ПетровичДата рождения: 02.02.1992Телефон: 79000000002'],
    ['Первый индекс', 'ФИО: Иванов Иван ИвановичДата рождения: 01.01.1990Телефон: 79000000003'],
    ['Второй индекс', 'ФИО: Иванов Иван ИвановичДата рождения: 03.03.1993Телефон: 79000000001'],
    ['Третий индекс', 'ФИО: Иванов Иван ИвановичТелефон: 79000000001'],
  ]);
  assert.deepEqual(report, original);
});

test('typed bundles remain distinct and different database ids get individual rows even with identical names', () => {
  const { document } = unpack(exampleReport({
    sources: [{ id: 'first', name: 'Общий источник' }, { id: 'second', name: 'Общий источник' }],
    records: [
      { fields: [['Ноль', 0], ['Флаг', false]], sources: ['first'] },
      { fields: [['Флаг', false], ['Ноль', 0]], sources: ['second'] },
      { fields: [['Ноль', '0'], ['Флаг', 'false']], sources: ['second'] },
    ],
  }));
  assert.equal(databaseRows(document).length, 4);
  assert.equal(document.match(/>0<\/w:t>/g)?.length, 3);
  assert.equal(document.match(/>false<\/w:t>/g)?.length, 3);
  assert.equal(document.match(/Общий источник/g)?.length, 3);
  assert.doesNotMatch(document, /Общий источник, Общий источник/);
  assert.deepEqual(databaseRows(document).slice(1).map((row) => cellText(cells(row)[0])), [
    'Общий источник (first)', 'Общий источник (second)', 'Общий источник (second)',
  ]);
});

test('phone roles are readable and distinct raw fields retain their values even with the same label', () => {
  const { document } = unpack(exampleReport({ records: [{
    fields: [['number_work', 'Рабочий 1'], ['phone_work', 'Рабочий 2'], ['work_number', 'Рабочий 3'], ['work_phone', 'Рабочий 4'],
      ['number_house', 'Домашний 1'], ['phone_house', 'Домашний 2'], ['home_phone', 'Домашний 3'], ['home_number', 'Домашний 4'],
      ['phone_mob', 'Мобильный 1'], ['mobile_phone', 'Мобильный 2'], ['phone_dop', 'Дополнительный 1'],
      ['phone_client', 'Клиентский 1'], ['phone_contragent', 'Контрагентский 1']], sources: ['first'],
  }] }));
  assert.equal(databaseRows(document).length, 2);
  const data = cells(databaseRows(document)[1])[1];
  assert.equal(data.match(/Рабочий телефон: /g)?.length, 4);
  assert.equal(data.match(/Домашний телефон: /g)?.length, 4);
  assert.equal(data.match(/Мобильный телефон: /g)?.length, 2);
  assert.equal(data.match(/Дополнительный телефон: /g)?.length, 1);
  assert.match(data, /Телефон клиента: /);
  assert.match(data, /Телефон контрагента: /);
  for (const value of ['Рабочий 1', 'Рабочий 2', 'Рабочий 3', 'Рабочий 4', 'Домашний 1', 'Домашний 2', 'Домашний 3', 'Домашний 4',
    'Мобильный 1', 'Мобильный 2', 'Дополнительный 1', 'Клиентский 1', 'Контрагентский 1']) assert.ok(data.includes(value), value);
  assert.doesNotMatch(data, /number_work|number_house|phone_work|work_phone|phone_house|home_phone|work_number|home_number|phone_mob|mobile_phone|phone_dop|phone_client|phone_contragent/);
});

test('bundle rows omit blank fields while preserving zero, false, structured values and duplicate-key values', () => {
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

test('multi-value FIO and phone cells remain whole without inferred individual pairs', () => {
  const { document } = unpack(exampleReport({ records: [{
    fields: [['number', '79000000001; 79000000002'], ['mail', 'a@example.test; b@example.test'],
      ['fio', 'Иванов Иван; Петров Пётр'], ['date_of_birth', ['01.01.1990', '02.02.1992']]], sources: ['first'],
  }] }));
  const rows = databaseRows(document);
  assert.equal(rows.length, 2);
  const data = cells(rows[1])[1];
  assert.match(data, /Иванов Иван; Петров Пётр/);
  assert.match(data, /79000000001; 79000000002/);
  assert.match(data, /a@example.test; b@example.test/);
  assert.equal(data.match(/ФИО: /g)?.length, 1);
  assert.equal(data.match(/Телефон: /g)?.length, 1);
  assert.ok(data.indexOf('ФИО: ') < data.indexOf('Дата рождения: '));
  assert.ok(data.indexOf('Дата рождения: ') < data.indexOf('Телефон: '));
  assert.ok(data.indexOf('Телефон: ') < data.indexOf('Email: '));
});

test('bundle labels are bold runs, values are normal escaped text and server objects cannot inject rich XML', () => {
  const { document } = unpack(exampleReport({ records: [{
    fields: [['<метка>', '<w:p>данные & значение</w:p>'],
      ['typed-wrapper', { type: 'rich', paragraphs: [{ runs: '<w:r>подмена</w:r>' }], xml: '<w:tbl>подмена</w:tbl>' }]], sources: ['first'],
  }] }));
  const row = databaseRows(document)[1];
  const data = cells(row)[1];
  assert.match(data, /<w:r><w:rPr><w:b\/>[\s\S]*?<w:t xml:space="preserve">&lt;метка&gt;: <\/w:t><\/w:r><w:r><w:rPr><w:color w:val="000000"\/><\/w:rPr><w:t xml:space="preserve">&lt;w:p&gt;данные &amp; значение&lt;\/w:p&gt;/);
  assert.match(data, /&quot;xml&quot;: &quot;&lt;w:tbl&gt;подмена&lt;\/w:tbl&gt;&quot;/);
  assert.equal(document.match(/<w:tbl>/g)?.length, 1);
  assert.doesNotMatch(data, /<w:r>подмена|<w:tbl>подмена/);
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
  const onlySeed = unpack(exampleReport({ records: [], sources: [], queries: [], identifiers: [
    { field: 'number', value: '79000000000', sources: [] },
  ] })).document;
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
  const tableHeader = paragraphs.find((value) => value.includes('>База данных</w:t>'));
  assert.match(tableHeader, /<w:keepNext\/>/);
  const recordValue = paragraphs.find((value) => value.includes('>ФИО: </w:t>'));
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
