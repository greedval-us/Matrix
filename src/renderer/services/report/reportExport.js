import { CFB } from 'xlsx/xlsx.mjs';
import { getSearchField } from '../../../shared/constants/searchItems.js';
import { key as fieldLabels } from '../../../shared/constants/translateKey.js';
import { groupReportRecords } from '../../utils/reportRecordGroups.js';
import { buildReportSearchSummary } from '../../utils/reportSearchSummary.js';
import { nonEmptyResultFields } from '../../../shared/utils/resultFields.js';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIP_NAMESPACE = 'http://schemas.openxmlformats.org/package/2006/relationships';
const PAGE = Object.freeze({ width: 11906, height: 16838, margin: 1134, contentWidth: 9638 });
const TABLE_BORDER_COLOR = 'D9D9D9';
const TABLE_HEADER_FILL = 'E9EDF1';
const TABLE_ALTERNATE_FILL = 'F7F8FA';
const BODY_FONT = 'Arial';
const PHONE_LABELS = Object.freeze({
  number_work: 'Рабочий телефон', phone_work: 'Рабочий телефон', work_number: 'Рабочий телефон', work_phone: 'Рабочий телефон',
  number_house: 'Домашний телефон', phone_house: 'Домашний телефон', home_phone: 'Домашний телефон', home_number: 'Домашний телефон',
  phone_mob: 'Мобильный телефон', mobile_phone: 'Мобильный телефон', phone_dop: 'Дополнительный телефон',
  phone_client: 'Телефон клиента', phone_contragent: 'Телефон контрагента',
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

function valueText(value) {
  if (value === undefined) return 'Не задано';
  if (value === null) return 'null';
  if (value === '') return 'Пустая строка';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2) ?? String(value);
}

function fieldText(key) {
  const original = String(key);
  const label = (Object.hasOwn(PHONE_LABELS, original) ? PHONE_LABELS[original] : '')
    || getSearchField(original)?.label || (Object.hasOwn(fieldLabels, original) ? fieldLabels[original] : '');
  return label || original;
}

function fieldOrder(key) {
  const label = fieldText(key).toLowerCase();
  if (label === 'фио') return 0;
  if (label === 'дата рождения') return 1;
  if (label.includes('телефон')) return 2;
  if (label === 'email') return 3;
  return 4;
}

// Only this internal wrapper enables rich table paragraphs. Source objects are
// always converted to escaped text by valueText/textRun, never interpreted as XML.
class RecordFieldsCell {
  constructor(fields) {
    this.fields = [...fields].sort(([left], [right]) => fieldOrder(left) - fieldOrder(right));
  }
}

class AggregateCell {
  constructor(key, item) {
    this.fields = nonEmptyResultFields([
      ['Поле', fieldText(key)], ['Значение', item.value], ['Количество', item.count],
    ]);
  }
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

function fieldParagraph(key, value) {
  return `<w:p><w:pPr><w:pStyle w:val="TableText"/><w:jc w:val="left"/></w:pPr>${textRun(`${fieldText(key)}: `, { bold: true })}${textRun(valueText(value))}</w:p>`;
}

function heading(text) {
  return paragraph(text, { style: 'Heading1', keepNext: true });
}

function table(headers, rows, widths) {
  const border = `<w:top w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:left w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:bottom w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:right w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:insideH w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/><w:insideV w:val="single" w:sz="4" w:color="${TABLE_BORDER_COLOR}"/>`;
  const properties = `<w:tblPr><w:tblW w:w="${PAGE.contentWidth}" w:type="dxa"/><w:tblBorders>${border}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="130" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:right w:w="130" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const rowXml = (values, index, isHeader = false) => {
    const shading = isHeader ? TABLE_HEADER_FILL : index % 2 ? TABLE_ALTERNATE_FILL : 'FFFFFF';
    const cells = values.map((value, column) => {
      const content = value instanceof AggregateCell
        ? paragraph('Сводные данные сервера', { style: 'TableText', bold: true })
          + value.fields.map(([key, fieldValue]) => fieldParagraph(key, fieldValue)).join('')
        : value instanceof RecordFieldsCell
        ? value.fields.map(([key, fieldValue]) => fieldParagraph(key, fieldValue)).join('')
        : paragraph(value, { style: 'TableText', bold: isHeader, keepNext: isHeader });
      return `<w:tc><w:tcPr><w:tcW w:w="${widths[column]}" w:type="dxa"/><w:shd w:val="clear" w:fill="${shading}"/><w:vAlign w:val="top"/></w:tcPr>${content}</w:tc>`;
    }).join('');
    return `<w:tr>${isHeader ? '<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>' : ''}${cells}</w:tr>`;
  };
  return `<w:tbl>${properties}<w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('')}</w:tblGrid>${rowXml(headers, 0, true)}${rows.map((row, index) => rowXml(row, index)).join('')}</w:tbl>${paragraph('', { style: 'TableGap' })}`;
}

function queryText(query) {
  if (typeof query === 'string') return query;
  return Object.entries(query || {}).map(([field, value]) => `${getSearchField(field)?.label || field}: ${valueText(value)}`).join('\n') || 'Не указан';
}

function collectionCauses(report) {
  const causes = new Set();
  for (const value of [...(report.warnings || []), ...(report.queries || []).map((query) => query.error)]) {
    if (!value) continue;
    const cause = String(value).trim()
      .replace(/^Запрос \S+(?: завершился с ошибкой:|:)\s*/u, '')
      .replace('; API не поддерживает получение следующей страницы.', '.');
    if (report.cancelled && cause === 'Сбор отчёта остановлен пользователем. Уже полученные данные сохранены.') continue;
    if (cause) causes.add(cause);
  }
  return [...causes];
}

function formattedDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Дата не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Moscow',
  }).format(date) + ' МСК';
}

function sourceReferences(keys, sourceNames) {
  const ids = [...new Set((Array.isArray(keys) ? keys : [])
    .filter((key) => key != null && String(key).trim() !== '').map(String))];
  return ids.length ? ids.map((key) => sourceNames.get(key) || key) : ['База не указана'];
}

function documentBody(report) {
  const sourceNames = new Map((report.sources || []).map((source) => [
    String(source.id), String(source.name ?? '').trim() ? String(source.name) : String(source.id),
  ]));
  const repeatedNames = new Set([...sourceNames.values()].filter((name, index, names) => names.indexOf(name) !== index));
  for (const [id, name] of sourceNames) {
    if (repeatedNames.has(name)) sourceNames.set(id, `${name} (${id})`);
  }
  const body = [
    paragraph('Отчёт по результатам поиска', { style: 'Title', keepNext: true }),
    paragraph(`Исходный запрос: ${queryText(report.seedQuery)}`),
    paragraph(`Сформирован ${formattedDate(report.createdAt)}`, { style: 'Subtitle' }),
  ];
  const causes = collectionCauses(report);
  if (report.cancelled) body.push(paragraph('Сбор остановлен пользователем.', { bold: true }));
  else if (!report.complete || causes.length) body.push(paragraph('Сбор завершён частично.', { bold: true }));
  causes.forEach((cause) => body.push(paragraph(cause, { style: 'Note' })));

  const summary = buildReportSearchSummary(report);
  const rows = groupReportRecords(report.records || []).flatMap((group) =>
    sourceReferences(group.sources, sourceNames).map((source) => [source, new RecordFieldsCell(group.fields)]));
  for (const aggregate of report.aggregates || []) {
    for (const item of Array.isArray(aggregate.items) ? aggregate.items : []) {
      if (!item || !nonEmptyResultFields([['value', item.value], ['count', item.count]]).length) continue;
      for (const source of sourceReferences(aggregate.sources, sourceNames)) {
        rows.push([source, new AggregateCell(aggregate.key, item)]);
      }
    }
  }
  if (summary.length || rows.length) {
    body.push(heading('Найденные поисковые значения'));
    body.push(summary.length
      ? table(['Поле', 'Все найденные значения'], summary.map(({ field, values }) => [
        getSearchField(field)?.label || field, values.join('; '),
      ]), [2200, 7438])
      : paragraph('Поисковые значения не найдены.'));
    body.push(heading('Данные по базам'));
    if (rows.length) {
      body.push(table(['База данных', 'Связанные данные'], rows, [2300, 7338]));
    } else body.push(paragraph('Связанные данные по базам не получены.'));
  } else body.push(paragraph('Данные не найдены.'));
  body.push(`<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/><w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" w:left="${PAGE.margin}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`);
  return body.join('');
}

function stylesXml() {
  const style = (id, name, properties, size, bold = false) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr>${properties}</w:pPr><w:rPr>${bold ? '<w:b/>' : ''}<w:color w:val="000000"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  const styles = [
    style('Title', 'Title', '<w:keepNext/><w:spacing w:before="0" w:after="180"/>', 46, true),
    style('Subtitle', 'Subtitle', '<w:spacing w:after="240"/>', 20),
    style('Heading1', 'heading 1', '<w:keepNext/><w:keepLines/><w:spacing w:before="300" w:after="140"/><w:outlineLvl w:val="0"/>', 30, true),
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
