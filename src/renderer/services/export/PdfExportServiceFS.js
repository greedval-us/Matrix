import { createPdfDocument } from './exportContent.js';

export default class PdfExportServiceFS {
  /**
   * Генерирует PDF-документ и возвращает его в виде Uint8Array
   * @param {Array} data – массив результатов
   * @returns {Promise<Uint8Array>} – готовые байты PDF
   */
  async export(data) {
    return new Promise((resolve, reject) => {
      try {
        createPdfDocument(data).getBuffer((buffer) => {
          resolve(new Uint8Array(buffer));
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}
