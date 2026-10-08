import * as XLSX from 'xlsx';
import { buildExcelWorkbook } from './exportContent.js';

export default class ExcelExportServiceFS {
  /**
   * Генерирует Excel-файл и возвращает его как Uint8Array
   * @param {Array} data – массив результатов
   * @returns {Uint8Array}
   */
  export(data) {
    const arrayBuffer = XLSX.write(buildExcelWorkbook(data), {
      bookType: 'xlsx',
      type: 'array',
    });
    return new Uint8Array(arrayBuffer);
  }
}
