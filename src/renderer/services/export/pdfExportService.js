import { createPdfDocument } from './exportContent.js';
import { getExportFileName } from './exportFormats.js';

export default class PdfExportService {
  export(data) {
    createPdfDocument(data).download(getExportFileName('pdf'));
  }
}
