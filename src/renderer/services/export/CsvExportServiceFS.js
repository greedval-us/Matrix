import { buildCsvContent } from './exportContent.js';

export default class CsvExportServiceFS {
  /**
   * Генерирует CSV-строку для сохранения на диск
   * @param {Array} data – массив результатов поиска
   * @returns {string} – готовый CSV текст (с BOM для Excel)
   */
  export(data) {
    return buildCsvContent(data);
  }
}
