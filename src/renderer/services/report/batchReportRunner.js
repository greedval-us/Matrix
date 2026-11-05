import { canonicalizeReportIdentifier, getReportSeedQuery } from '../../../shared/utils/reportIdentifiers.js';
import { ReportService } from './ReportService.js';

export function prepareBatchReportSeeds(field, queries) {
  const seeds = [];
  const seen = new Set();
  let duplicates = 0;
  let invalid = 0;
  for (const rawValue of queries) {
    const value = canonicalizeReportIdentifier(field, rawValue);
    if (!value) { invalid++; continue; }
    const fingerprint = JSON.stringify([field, value]);
    if (seen.has(fingerprint)) { duplicates++; continue; }
    seen.add(fingerprint);
    seeds.push({ value, query: getReportSeedQuery({ [field]: value }) });
  }
  return { seeds, duplicates, invalid };
}

export async function runBatchReports({ seeds, folder, fileService, isCancelled, onLog,
  onActiveService = () => {}, createService = () => new ReportService(), buildDocument, getFileName }) {
  let stopped = false;
  if (!buildDocument || !getFileName) {
    const exporter = await import('./reportExport.js');
    buildDocument ||= exporter.buildReportDocx;
    getFileName ||= exporter.getReportFileName;
  }
  for (const [index, seed] of seeds.entries()) {
    if (isCancelled()) break;
    onLog(`Отчёт ${index + 1} из ${seeds.length}: ${seed.value}`);
    const service = createService();
    onActiveService(service);
    let report;
    try {
      report = await service.collect({ seedQuery: seed.query, onProgress(progress) {
        if (progress.type === 'query-completed') {
          const aggregateSummary = progress.stats?.aggregates ? ` · сводок сервера: ${progress.stats.aggregates}` : '';
          onLog(`Проверено запросов: ${progress.stats?.queries || 0} · записей: ${progress.stats?.records || 0}${aggregateSummary}`);
        }
      } });
    } catch (error) {
      if (!isCancelled()) onLog(`Ошибка отчёта ${index + 1}: ${error?.message || error}`);
      continue;
    } finally { onActiveService(null); }
    if ((isCancelled() || report.cancelled) && !report.records?.length && !report.aggregates?.length) {
      stopped = true;
      onLog('Текущий отчёт остановлен до получения данных. Файл не создан.');
      break;
    }
    try {
      const partialPrefix = report.complete ? '' : 'частичный-';
      const fileName = `${index + 1}-${partialPrefix}${getFileName(report)}`;
      const bytes = await buildDocument(report);
      await fileService.writeFile(bytes, `${folder}/${fileName}`);
      const aggregateCount = report.stats?.aggregates || report.aggregates?.length || 0;
      const aggregateSummary = aggregateCount ? ` · сводок сервера: ${aggregateCount}` : '';
      onLog(`Сохранено: ${fileName} · уникальных записей: ${report.stats?.records || report.records?.length || 0}${aggregateSummary}`);
      if (!report.complete) onLog('Отчёт частичный: полнота сбора не подтверждена. Ограничения указаны в документе.');
    } catch (error) {
      onLog(`Не удалось сохранить отчёт ${index + 1}: ${error?.message || error}`);
    }
    if (isCancelled() || report.cancelled) { stopped = true; break; }
  }
  onActiveService(null);
  onLog(stopped || isCancelled() ? 'Сбор отчётов остановлен. Готовые документы остаются в выбранной папке.' : 'Сбор отчётов завершён.');
}
