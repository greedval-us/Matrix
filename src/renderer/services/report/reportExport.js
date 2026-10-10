import { CFB } from 'xlsx/xlsx.mjs';
import { getSearchField } from '../../../shared/constants/searchItems.js';
import { key as fieldLabels } from '../../../shared/constants/translateKey.js';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PAGE = Object.freeze({ width: 11906, height: 16838, margin: 1134, contentWidth: 9638 });
const TABLE_BORDER_COLOR = 'D9D9D9';
const TABLE_HEADER_FILL = 'E9EDF1';
const TABLE_ALTERNATE_FILL = 'F7F8FA';
const BODY_FONT = 'Arial';
const QUERY_STATUSES = Object.freeze({
  completed: 'Завершён', partial: 'Частично выполнен', failed: 'Ошибка', cancelled: 'Остановлен',
});
const STAT_LABELS = Object.freeze({
  records: 'Уникальных записей', sources: 'Источников в выдаче', queries: 'Поисковых запросов',
  identifiers: 'Найденных идентификаторов', duplicates: 'Повторных записей объединено',
  aggregates: 'Сводок сервера',
  aggregateDuplicates: 'Повторных сводок объединено',
  pendingQueries: 'Запросов осталось невыполнено',
});

// XML 1.0 cannot represent some source characters. Keep their visible escape
// sequences in the report instead of silently discarding original data.
function xml(value) {
  return Array.from(String(value ?? ''), (character) => {
    const code = character.codePointAt(0);
    if ((code < 32 && ![9, 10, 13].includes(code)) || (code >= 0xD800 && code <= 0xDFFF)
      || code === 0xFFFE || code === 0xFFFF) {
      return `\\u${code.toString(16).padStart(4, '0')}`;
    }
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character] ?? character;
  }).join('');
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function valueText(value) {
  if (value === undefined) return 'Не задано';
  if (value === null) return 'null';
  if (value === '') return 'Пустая строка';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return `${value} [число]`;
  if (typeof value === 'boolean') return `${value} [логическое значение]`;
  return JSON.stringify(value, null, 2) ?? String(value);
}

function fieldText(key) {
  const original = String(key);
  const label = getSearchField(original)?.label || (Object.hasOwn(fieldLabels, original) ? fieldLabels[original] : '');
  return label && label !== original ? `${label} (${original})` : original;
}

function textRun(text, { bold = false, color = '000000' } = {}) {
  const properties = `<w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="${color}"/></w:rPr>`;
  const contents = String(text ?? '').replace(/\r\n?/g, '\n').split(/([\n\t])/).map((part) => {
    if (part === '\n') return '<w:br/>';
    if (part === '\t') return '<w:tab/>';
    return `<w:t xml:space="preserve">${xml(part)}</w:t>`;
  }).join('');
  return `<w:r>${properties}${contents}</w:r>`;
}

function paragraph(text, { style = 'Normal', keepNext = false, bold = false, alignment = 'left' } = {}) {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${keepNext ? '<w:keepNext/>' : ''}<w:jc w:val="${alignment}"/></w:pPr>${textRun(text, { bold })}</w:p>`;
}

function heading(text, level = 1) {
  return paragraph(text, { style: `Heading${level}`, keepNext: true });
}

function table(headers, rows, widths) {
  const border = `<w:top w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:left w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:bottom w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:right w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:insideH w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:insideV w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/>`;
  const properties = `<w:tblPr><w:tblW w:w="${PAGE.contentWidth}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const rowXml = (values, index, isHeader = false) => {
    const shading = isHeader ? TABLE_HEADER_FILL : index % 2 ? TABLE_ALTERNATE_FILL : 'FFFFFF';
    const cells = values.map((value, column) => `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:shd w:val="clear" w:fill="${shading}"/><w:vAlign w:val="center"/></w:tcPr>${paragraph(value, { style: 'TableText', bold: isHeader, keepNext: isHeader })}</w:tc>`).join('');
    return `<w:tr>${isHeader ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : ''}${cells}</w:tr>`;
  };
  return `<w:tbl>${properties}<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rowXml(headers, 0, true)}${rows.map((row, index) => rowXml(row, index)).join('')}</w:tbl>${paragraph('', { style: 'TableGap' })}`;
}

function queryText(query) {
  if (typeof query === 'string') return query;
  return Object.entries(query || {}).map(([field, value]) => `${getSearchField(field)?.label || field}: ${valueText(value)}`).join('\n') || 'Не указан';
}

function collectionStatus(report) {
  if (report.cancelled) return 'Сбор остановлен пользователем. Отчёт содержит данные, полученные до остановки.';
  if (!report.complete) return 'Сбор завершён частично. Отчёт содержит полученные данные; ограничения приведены ниже.';
  return 'Сбор завершён. Повторные записи объединены с сохранением ссылок на источники.';
}

function formattedDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow',
  }).format(date) + ' МСК';
}

function sourceReferences(keys, sourceNumbers) {
  return [...new Set(keys || [])].map((key) => sourceNumbers.get(String(key)) || String(key)).join(', ') || 'Не указан';
}

function summarizeFields(records) {
  const fields = new Map();
  for (const record of records) {
    for (const [key, value] of record.fields || []) {
      const values = fields.get(String(key)) || new Map();
      const identity = stableValue(value);
      const entry = values.get(identity) || { value, sources: new Set() };
      for (const source of record.sources || []) entry.sources.add(source);
      values.set(identity, entry);
      fields.set(String(key), values);
    }
  }
  return fields;
}

function documentBody(report) {
  const records = report.records || [];
  const sources = report.sources || [];
  const queries = report.queries || [];
  const aggregates = report.aggregates || [];
  const sourceNumbers = new Map(sources.map((source, index) => [String(source.id), `И${index + 1}`]));
  const queryNumbers = new Map(queries.map((query, index) => [String(query.id), `З${index + 1}`]));
  const body = [
    paragraph('Отчёт по результатам поиска', { style: 'Title', keepNext: true }),
    paragraph(`Сформирован ${formattedDate(report.createdAt)}`, { style: 'Subtitle' }),
    paragraph(collectionStatus(report), { bold: true }),
    paragraph('Документ объединяет сведения, найденные по исходному запросу и связанным точным идентификаторам. Совпадение идентификаторов отражает связь найденных записей и само по себе не подтверждает, что все сведения относятся к одному человеку.'),
    heading('Исходный запрос'),
    paragraph(queryText(report.seedQuery)),
    paragraph('Поиск по ФИО и дате рождения не выполняется. Эти сведения включаются в отчёт, если присутствуют в найденных записях.', { style: 'Note' }),
    heading('Результаты сбора'),
  ];
  const counts = {
    records: records.length, sources: sources.length, queries: queries.length,
    identifiers: (report.identifiers || []).length, duplicates: 0, pendingQueries: 0,
    aggregates: aggregates.length, aggregateDuplicates: 0,
    ...report.stats,
  };
  body.push(table(['Показатель', 'Значение'], Object.entries(STAT_LABELS)
    .filter(([key]) => !['aggregates', 'aggregateDuplicates'].includes(key) || aggregates.length)
    .map(([key, label]) => [label, String(counts[key] ?? 0)]), [7138, 2500]));

  if ((report.warnings || []).length || !report.complete) {
    body.push(heading('Ограничения сбора'));
    const warnings = [...new Set(report.warnings || [])];
    if (!warnings.length) warnings.push('Сбор не завершён. Часть запросов могла остаться невыполненной.');
    warnings.forEach((warning) => body.push(paragraph(warning)));
  }

  if ((report.identifiers || []).length) {
    body.push(heading('Связанные идентификаторы'));
    body.push(paragraph('Здесь указаны идентификаторы исходного запроса и значения, найденные в ходе сбора. Источники приведены, когда сервер предоставил связь с записью.', { style: 'Note', keepNext: true }));
    body.push(table(['Поле', 'Идентификатор', 'Источники'], report.identifiers.map((identifier) => [
      getSearchField(identifier.field)?.label || String(identifier.field), valueText(identifier.value),
      sourceReferences(identifier.sources, sourceNumbers),
    ]), [2200, 5000, 2438]));
  }

  body.push(heading('Найденные сведения'));
  if (!records.length) {
    body.push(paragraph('Записи не найдены. Сведения о выполненных запросах приведены в журнале поиска.'));
  } else {
    body.push(paragraph('Одинаковые значения внутри одного поля показаны один раз. Различающиеся значения сохранены отдельно. Обозначения И1, И2 и далее соответствуют источникам в разделе «Источники данных».', { style: 'Note', keepNext: true }));
    const rows = [];
    for (const [key, values] of summarizeFields(records)) {
      for (const entry of values.values()) rows.push([fieldText(key), valueText(entry.value), sourceReferences([...entry.sources], sourceNumbers)]);
    }
    body.push(table(['Поле', 'Найденное значение', 'Источники'], rows, [2200, 5000, 2438]));
  }

  if (aggregates.length) {
    body.push(heading('Сводные данные сервера'));
    body.push(paragraph('Эти сведения сервер передал в виде сгруппированных значений и счётчиков. Они показаны отдельно от найденных записей. Счётчики разных запросов не суммируются; принадлежность значений одному человеку из них не устанавливается.', { style: 'Note', keepNext: true }));
    aggregates.forEach((aggregate, index) => {
      body.push(heading(`Сводка ${index + 1}`, 2));
      body.push(paragraph(`Поле: ${fieldText(aggregate.key)}`, { keepNext: true }));
      const provenance = aggregate.sources?.length
        ? `Источники: ${sourceReferences(aggregate.sources, sourceNumbers)}.`
        : 'Источник агрегата сервером не указан.';
      const linkedQueries = (aggregate.queryIds || []).map((id) => queryNumbers.get(String(id)) || String(id)).join(', ') || 'Не указан';
      body.push(paragraph(`${provenance} Запросы: ${linkedQueries}.`, { style: 'Note', keepNext: true }));
      if (aggregate.items?.length) {
        body.push(table(['Значение', 'Количество в ответе сервера'], aggregate.items.map((item) => [
          valueText(item.value), valueText(item.count),
        ]), [6638, 3000]));
      } else body.push(paragraph('Сервер передал пустую сводку.'));
    });
  }

  body.push(heading('Источники данных'));
  if (!sources.length) body.push(paragraph('Источники с данными отсутствуют.'));
  sources.forEach((source, index) => {
    const hasInfo = source.info !== undefined && source.info !== null && source.info !== '';
    const hasTrust = source.trust !== undefined && source.trust !== null && source.trust !== '';
    const metadata = Object.entries(source).filter(([key]) => !['id', 'name', 'info', 'trust'].includes(key));
    body.push(heading(`И${index + 1} ${source.name || source.id || 'Источник без названия'}`, 2));
    body.push(paragraph(`Идентификатор источника: ${source.id ?? 'Не указан'}`, { style: 'Note', keepNext: hasInfo || hasTrust || metadata.length > 0 }));
    if (hasInfo) body.push(paragraph(valueText(source.info), { keepNext: hasTrust || metadata.length > 0 }));
    if (hasTrust) body.push(paragraph(`Оценка источника: ${valueText(source.trust)}`, { keepNext: metadata.length > 0 }));
    if (metadata.length) body.push(table(['Сведения об источнике', 'Значение'], metadata.map(([key, value]) => [key, valueText(value)]), [4000, 5638]));
  });

  body.push(heading('Полные найденные записи'));
  body.push(paragraph('Записи приведены без сокращения набора полей. Для каждой записи указаны источники и поисковые запросы, по которым она получена. Идентичные записи объединены; различия между записями сохранены.', { style: 'Note', keepNext: true }));
  if (!records.length) body.push(paragraph('Нет записей для отображения.'));
  records.forEach((record, index) => {
    body.push(heading(`Запись ${index + 1}`, 2));
    body.push(paragraph(`Источники: ${sourceReferences(record.sources, sourceNumbers)}. Запросы: ${(record.queryIds || []).map((id) => queryNumbers.get(String(id)) || String(id)).join(', ') || 'Не указан'}.`, { style: 'Note', keepNext: true }));
    if (record.sourceRecordIds?.length) {
      body.push(paragraph(`Идентификаторы записей в источниках: ${record.sourceRecordIds.map(({ source, id }) => `${sourceNumbers.get(String(source)) || source}: ${id}`).join('; ')}`, { style: 'Note', keepNext: true }));
    }
    const fields = (record.fields || []).map(([key, value]) => [fieldText(key), valueText(value)]);
    if (fields.length) body.push(table(['Поле', 'Значение'], fields, [2500, 7138]));
    else body.push(paragraph('Поля записи отсутствуют.'));
  });

  body.push(heading('Журнал поисковых запросов'));
  if (!queries.length) body.push(paragraph('Выполненные запросы отсутствуют.'));
  queries.forEach((query, index) => {
    const hasMetadata = query.meta && Object.keys(query.meta).length > 0;
    body.push(heading(`З${index + 1} ${QUERY_STATUSES[query.status] || query.status || 'Статус не указан'}`, 2));
    body.push(paragraph(queryText(query.query), { keepNext: Boolean(query.error || hasMetadata) }));
    if (query.error) body.push(paragraph(`Ошибка: ${query.error}`, { keepNext: Boolean(hasMetadata) }));
    if (hasMetadata) {
      body.push(table(['Сведения о выполнении', 'Значение'], Object.entries(query.meta).map(([key, value]) => [key, valueText(value)]), [4000, 5638]));
    }
  });
  body.push(`<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`);
  return body.join('');
}

function stylesXml() {
  const style = (id, name, properties, size, bold = false) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr>${properties}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="000000"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = [
    style('Title', 'Title', '<w:keepNext/><w:spacing w:before="0" w:after="180"/>', 46, true),
    style('Subtitle', 'Subtitle', '<w:spacing w:after="240"/>', 20),
    style('Heading1', 'heading 1', '<w:keepNext/><w:keepLines/><w:spacing w:before="300" w:after="140"/><w:outlineLvl w:val="0"/>', 30, true),
    style('Heading2', 'heading 2', '<w:keepNext/><w:keepLines/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/>', 24, true),
    style('Note', 'Note', '<w:spacing w:after="140" w:line="260" w:lineRule="auto"/>', 20),
    style('TableText', 'Table Text', '<w:spacing w:after="40" w:line="260" w:lineRule="auto"/>', 21),
    style('TableGap', 'Table Gap', '<w:spacing w:after="100" w:line="80" w:lineRule="exact"/>', 4),
    style('Header', 'Header', '<w:spacing w:after="0"/>', 18),
    style('Footer', 'Footer', '<w:spacing w:after="0"/><w:jc w:val="right"/>', 18),
  ];
  return `${XML_HEADER}<w:styles xmlns:w="${WORD_NAMESPACE}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${BODY_FONT}" w:hAnsi="${BODY_FONT}" w:cs="${BODY_FONT}"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl/><w:wordWrap w:val="0"/><w:spacing w:after="140" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>${styles.join('')}</w:styles>`;
}

function packageParts(report) {
  const parsedDate = new Date(report.createdAt);
  const timestamp = Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : '2000-01-01T00:00:00.000Z';
  const relationships = (items) => `${XML_HEADER}<Relationships xmlns="${PACKAGE_RELATIONSHIP_NAMESPACE}">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`).join('')}</Relationships>`;
  return {
    '[Content_Types].xml': `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    '_rels/.rels': relationships([
      ['rId1', `${RELATIONSHIP_NAMESPACE}/officeDocument`, 'word/document.xml'],
      ['rId2', 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', 'docProps/core.xml'],
      ['rId3', `${RELATIONSHIP_NAMESPACE}/extended-properties`, 'docProps/app.xml'],
    ]),
    'docProps/core.xml': `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Отчёт по результатам поиска</dc:title><dc:creator>Matrix</dc:creator><cp:lastModifiedBy>Matrix</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${timestamp}</dcterms:modified></cp:coreProperties>`,
    'docProps/app.xml': `${XML_HEADER}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Matrix</Application></Properties>`,
    'word/document.xml': `${XML_HEADER}<w:document xmlns:w="${WORD_NAMESPACE}" xmlns:r="${RELATIONSHIP_NAMESPACE}"><w:body>${documentBody(report)}</w:body></w:document>`,
    'word/styles.xml': stylesXml(),
    'word/settings.xml': `${XML_HEADER}<w:settings xmlns:w="${WORD_NAMESPACE}"><w:defaultTabStop w:val="720"/><w:updateFields w:val="true"/></w:settings>`,
    'word/_rels/document.xml.rels': relationships([
      ['rIdStyles', `${RELATIONSHIP_NAMESPACE}/styles`, 'styles.xml'],
      ['rIdSettings', `${RELATIONSHIP_NAMESPACE}/settings`, 'settings.xml'],
      ['rIdHeader', `${RELATIONSHIP_NAMESPACE}/header`, 'header1.xml'],
      ['rIdFooter', `${RELATIONSHIP_NAMESPACE}/footer`, 'footer1.xml'],
    ]),
    'word/header1.xml': `${XML_HEADER}<w:hdr xmlns:w="${WORD_NAMESPACE}">${paragraph('Matrix     Отчёт по результатам поиска', { style: 'Header' })}</w:hdr>`,
    'word/footer1.xml': `${XML_HEADER}<w:ftr xmlns:w="${WORD_NAMESPACE}"><w:p><w:pPr><w:pStyle w:val="Footer"/></w:pPr>${textRun('Страница ')}<w:fldSimple w:instr="PAGE">${textRun('1')}</w:fldSimple>${textRun(' из ')}<w:fldSimple w:instr="NUMPAGES">${textRun('1')}</w:fldSimple></w:p></w:ftr>`,
  };
}

/** Create an editable Word document. Source values remain plain text, never links or OOXML. */
export function buildReportDocx(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new TypeError('Не переданы данные отчёта.');
  const archive = CFB.utils.cfb_new();
  const encoder = new TextEncoder();
  for (const [path, content] of Object.entries(packageParts(report))) CFB.utils.cfb_add(archive, path, encoder.encode(content));
  return new Uint8Array(CFB.write(archive, { fileType: 'zip', type: 'array', compression: true }));
}

export function getReportFileName(report) {
  const date = new Date(report?.createdAt);
  const datePart = Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
    : 'без-даты';
  const queryPart = Array.from(queryText(report?.seedQuery).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').replace(/[. ]+$/g, '').trim()).slice(0, 80).join('').replace(/[. ]+$/g, '') || 'поиск';
  return `Отчёт Matrix ${datePart} ${queryPart}.docx`;
}
