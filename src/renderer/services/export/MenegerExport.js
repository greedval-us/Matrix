import PdfExportService from './pdfExportService.js';
import PdfExportServiceFS from './PdfExportServiceFS.js';
import ExcelExportService from './excelExportService.js';
import ExcelExportServiceFS from './ExcelExportServiceFS.js';
import TxtExportService from './txtExportService.js';
import TxtExportServiceFS from './TxtExportServiceFS.js';
import CsvExportService from './csvExportService.js';
import CsvExportServiceFS from './CsvExportServiceFS.js';
import { EXPORT_FORMATS } from './exportFormats.js';

const EXPORTER_CLASSES = {
  pdf: [PdfExportService, PdfExportServiceFS],
  excel: [ExcelExportService, ExcelExportServiceFS],
  txt: [TxtExportService, TxtExportServiceFS],
  csv: [CsvExportService, CsvExportServiceFS],
};

export default class ManagerExport {
  constructor() {
    this.exporters = {};
    for (const { id, fsFormat } of EXPORT_FORMATS) {
      const [BrowserExporter, FileExporter] = EXPORTER_CLASSES[id];
      this.exporters[id] = new BrowserExporter();
      this.exporters[fsFormat] = new FileExporter();
    }
  }

  /**
   * Универсальный вызов
   * @param {Array} data
   * @param {string} format
   * @param {string} [fullPath]
   * @param {string} [fileName]
     * @returns {string|Uint8Array|Promise<Uint8Array>|void} - Fs возвращает данные
   */
  export(data, format, fullPath, fileName) {
    if (!Object.hasOwn(this.exporters, format)) {
      throw new Error(`Export format "${format}" is not supported`);
    }

    return this.exporters[format].export(data, fullPath, fileName);
  }
}
