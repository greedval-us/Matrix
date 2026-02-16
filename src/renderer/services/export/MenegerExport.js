import PdfExportService from './pdfExportService'
import PdfExportServiceFS from './PdfExportServiceFS'
import ExcelExportService from './excelExportService'
import ExcelExportServiceFS from './ExcelExportServiceFS'
import TxtExportService from './txtExportService'      // старая (для браузера)
import TxtExportServiceFS from './TxtExportServiceFS'  // новая (для FileService)
import CsvExportService from './csvExportService'
import CsvExportServiceFS from './CsvExportServiceFS'

export default class ManagerExport {
  constructor() {
    this.exporters = {
      pdf:    new PdfExportService(),       // скачивание браузером
      pdfFs:  new PdfExportServiceFS(),     // возврат Uint8Array
      excel:  new ExcelExportService(),     // скачивание браузером
      excelFs:new ExcelExportServiceFS(),   // возврат Uint8Array
      txt:    new TxtExportService(),       // скачивание браузером
      txtFs:  new TxtExportServiceFS(),     // возврат string
      csv:    new CsvExportService(),       // скачивание браузером
      csvFs:  new CsvExportServiceFS(),     // возврат string
    }
  }

  /**
   * Универсальный вызов
   * @param {Array} data
   * @param {string} format
   * @param {string} [fullPath]
   * @param {string} [fileName]
   * @returns {string|Uint8Array|void} - для Fs форматов возвращает данные
   */
  export(data, format, fullPath, fileName) {
    const exporter = this.exporters[format]
    if (!exporter) {
      throw new Error(`Export format "${format}" is not supported`)
    }

    // Если это файловая версия (суффикс Fs) — просто возвращаем результат
    if (format.endsWith('Fs')) {
      return exporter.export(data)
    }

    // Иначе это «браузерная» версия — запускаем скачивание
    exporter.export(data, fullPath, fileName)
  }
}