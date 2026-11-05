import { buildTxtContent } from './exportContent.js';

export default class TxtExportServiceFS {
  /**
   * Генерирует текст для сохранения во внешний файл
   * @param {Array} data – массив результатов поиска
   * @returns {string} – готовый текст
   */
  export(data) {
    return buildTxtContent(data);
  }
}
