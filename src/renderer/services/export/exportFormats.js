export const EXPORT_FORMATS = Object.freeze([
  Object.freeze({ id: 'txt', label: 'TXT', extension: 'txt', fsFormat: 'txtFs' }),
  Object.freeze({ id: 'pdf', label: 'PDF', extension: 'pdf', fsFormat: 'pdfFs' }),
  Object.freeze({ id: 'csv', label: 'CSV', extension: 'csv', fsFormat: 'csvFs' }),
  Object.freeze({ id: 'excel', label: 'Excel', extension: 'xlsx', fsFormat: 'excelFs' }),
]);

const DEFAULT_EXPORT_NAME = 'результат';

export function getExportFormat(id) {
  const format = EXPORT_FORMATS.find((candidate) => candidate.id === id);
  if (!format) throw new Error(`Export format "${id}" is not supported`);
  return format;
}

export function getExportFileName(id) {
  return `${DEFAULT_EXPORT_NAME}.${getExportFormat(id).extension}`;
}
