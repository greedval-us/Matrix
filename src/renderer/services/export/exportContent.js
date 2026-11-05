import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake.js';
import pdfFonts from 'pdfmake/build/vfs_fonts.js';
import { groupSearchResults } from '../../utils/searchResults.js';

pdfMake.vfs = pdfFonts;

const NO_DATA_LABEL = 'Нет данных';
const CSV_BOM = '\uFEFF';
const TXT_GROUP_SEPARATOR = '-----------------------\n\n';
const EXCEL_SHEET_NAME_LIMIT = 31;
const EXCEL_INVALID_SHEET_CHARACTERS = /[/\\?*[\]:]/g;
const PDF_FONT = 'Roboto';

function escapeCsv(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return text.includes('"') || text.includes(',') || text.includes('\n')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

export function buildTxtContent(data) {
  const grouped = groupSearchResults(data);
  let text = '';

  grouped.forEach((group, index) => {
    text += `Источник: ${group.name}\n`;
    if (group.info) text += `${group.info}\n`;
    text += '\n';

    if (group.data.length) {
      group.data.forEach((fields) => {
        if (!Array.isArray(fields)) return;
        fields.forEach(([key, value]) => {
          text += `${key} = ${value ?? ''}\n`;
        });
        text += '\n';
      });
    } else {
      text += `${NO_DATA_LABEL}\n\n`;
    }

    if (index < grouped.length - 1) text += TXT_GROUP_SEPARATOR;
  });

  return text;
}

export function buildCsvContent(data, { quoteMetadata = false } = {}) {
  const grouped = groupSearchResults(data);
  let csv = '';

  grouped.forEach((group, index) => {
    // Browser exports historically wrap metadata lines in an additional pair of quotes.
    const sourceLine = `Источник: ${escapeCsv(group.name)}`;
    csv += quoteMetadata ? `"${sourceLine}"\n` : `${sourceLine}\n`;
    if (group.info) {
      const infoLine = escapeCsv(group.info);
      csv += quoteMetadata ? `"${infoLine}"\n` : `${infoLine}\n`;
    }
    csv += '\n';

    if (group.data.length) {
      const headerKeys = new Set();
      for (const fields of group.data) {
        for (const [key] of fields) headerKeys.add(key);
      }
      const headers = [...headerKeys];
      csv += headers.map(escapeCsv).join(',') + '\n';
      group.data.forEach((fields) => {
        const row = Object.fromEntries(fields);
        // Look up original keys; escaped header text is only for the output line.
        csv += headers.map((key) => escapeCsv(row[key] ?? '')).join(',') + '\n';
      });
    } else {
      csv += `"${NO_DATA_LABEL}"\n`;
    }

    if (index < grouped.length - 1) csv += '\n';
  });

  return CSV_BOM + csv;
}

function uniqueSheetName(name, usedNames) {
  const baseName = name.replace(EXCEL_INVALID_SHEET_CHARACTERS, '_').substring(0, EXCEL_SHEET_NAME_LIMIT);
  let sheetName = baseName;
  let suffix = 1;
  while (usedNames.has(sheetName)) {
    const ending = '_' + suffix++;
    sheetName = baseName.substring(0, EXCEL_SHEET_NAME_LIMIT - ending.length) + ending;
  }
  usedNames.add(sheetName);
  return sheetName;
}

export function buildExcelWorkbook(data) {
  const workbook = XLSX.utils.book_new();
  const sheetNames = new Set();

  for (const group of groupSearchResults(data)) {
    const rows = group.data.map((fields) => {
      const row = {};
      if (Array.isArray(fields)) {
        fields.forEach(([key, value]) => { row[key] = value; });
      }
      return row;
    });
    const sheetName = uniqueSheetName(group.name || 'Sheet', sheetNames);
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ [NO_DATA_LABEL]: '' }]);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }

  return workbook;
}

export function buildPdfDefinition(data) {
  const grouped = groupSearchResults(data);
  const content = [];

  grouped.forEach((group, index) => {
    content.push(
      { text: `Источник: ${group.name}`, style: 'header' },
      { text: group.info || '', style: 'subheader', margin: [0, 0, 0, 10] },
    );

    if (group.data.length) {
      group.data.forEach((fields) => {
        if (!Array.isArray(fields)) return;
        content.push({
          stack: fields.map(([key, value]) => ({
            text: `${key}: ${value ?? ''}`,
            margin: [0, 0, 0, 2],
          })),
          margin: [0, 0, 0, 10],
          style: 'recordBlock',
        });
      });
    } else {
      content.push({ text: NO_DATA_LABEL, italics: true, margin: [0, 0, 0, 15] });
    }

    if (index < grouped.length - 1) content.push({ text: '', margin: [0, 0, 0, 10] });
  });

  return {
    content,
    defaultStyle: { font: PDF_FONT },
    styles: {
      header: { fontSize: 16, bold: true, margin: [0, 0, 0, 6] },
      subheader: { fontSize: 10, color: 'gray' },
      recordBlock: { margin: [0, 0, 0, 10], fontSize: 10 },
    },
  };
}

export function createPdfDocument(data) {
  return pdfMake.createPdf(buildPdfDefinition(data));
}
