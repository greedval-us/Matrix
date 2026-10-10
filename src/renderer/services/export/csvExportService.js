import { buildCsvContent } from './exportContent.js';
import { downloadContent } from './browserDownload.js';
import { getExportFileName } from './exportFormats.js';

export default class CsvExportService {
  export(data) {
    downloadContent(
      buildCsvContent(data, { quoteMetadata: true }),
      getExportFileName('csv'),
      'text/csv;charset=utf-8',
    );
  }
}
