import { SearchService } from '../SearchService.js';
import { withSearchClient } from '../search/searchSession.js';
import { createMonotonicIdGenerator } from '../../utils/monotonicId.js';
import { getFileApi } from '../../infrastructure/desktopApi.js';
import { SERVER_CONFIG_LIMITS } from '../../../shared/constants/serverConfig.js';
import { getReportSeedQuery } from '../../../shared/utils/reportIdentifiers.js';
import { collectReport } from './collectReport.js';

const nextReportId = createMonotonicIdGenerator();
const WORD_FILTERS = Object.freeze([{ name: 'Документ Word', extensions: ['docx'] }]);

// One service owns one isolated report session. Ordinary search uses its own client.
export class ReportService {
  constructor({ searchService = new SearchService(), collect = collectReport, createId = nextReportId } = {}) {
    this.searchService = searchService;
    this.collectReport = collect;
    this.createId = createId;
    this.operation = null;
  }

  async collect({ seedQuery, onProgress, limits } = {}) {
    if (this.operation) throw new Error('Сбор отчёта уже выполняется.');
    const originalSeed = { ...seedQuery };
    getReportSeedQuery(originalSeed);
    const operation = { id: `report-${this.createId()}`, cancelled: false };
    this.operation = operation;
    let report;
    const run = () => this.collectReport({
      seedQuery: originalSeed, limits,
      isCancelled: () => operation.cancelled,
      onProgress,
      search: (query, options) => {
        if (operation.cancelled) return Promise.resolve({ meta: { cancelled: true } });
        return this.searchService.search(operation.id, {
          ...query, limit: SERVER_CONFIG_LIMITS.pageSize.max,
        }, options);
      },
    });
    try {
      try {
        await withSearchClient(this.searchService, operation.id, async () => { report = await run(); }, {
          onCleanupError: (error) => {
            if (!report) return;
            report.complete = false;
            report.warnings.push(`Не удалось закрыть подключение отчёта: ${error?.message || String(error)}`);
          },
        });
      } catch (error) {
        if (!operation.cancelled) throw error;
        // A cancelled connection may fail before the collector starts. Return
        // the normal cancelled report shape without sending a search request.
        report = await run();
      }
      return report;
    } finally {
      if (this.operation === operation) this.operation = null;
    }
  }

  cancel() {
    if (!this.operation) return;
    this.operation.cancelled = true;
    this.searchService.cancelSearch(this.operation.id);
  }
}

export async function saveReport(report, {
  fileApi = getFileApi(),
  loadExporter = () => import('./reportExport.js'),
} = {}) {
  const { buildReportDocx, getReportFileName } = await loadExporter();
  const filePath = await fileApi.saveDialog(getReportFileName(report), WORD_FILTERS);
  if (!filePath) return { cancelled: true, saved: false };
  const bytes = await buildReportDocx(report);
  const saved = await fileApi.write(filePath, bytes, true);
  if (saved === false) throw new Error('Не удалось сохранить отчёт.');
  return { cancelled: false, saved: true, filePath };
}
