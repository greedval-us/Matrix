import * as XLSX from 'xlsx';
import { buildExcelWorkbook } from './exportContent.js';
import { getExportFileName } from './exportFormats.js';

export default class ExcelExportService {
  export(data) {
    XLSX.writeFile(buildExcelWorkbook(data), getExportFileName('excel'));
  }
}
