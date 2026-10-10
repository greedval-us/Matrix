import { buildTxtContent } from './exportContent.js';
import { downloadContent } from './browserDownload.js';
import { getExportFileName } from './exportFormats.js';

export default class TxtExportService {
  export(data) {
    downloadContent(buildTxtContent(data), getExportFileName('txt'), 'text/plain;charset=utf-8');
  }
}
