import { getExportFormat } from '../export/exportFormats.js';
import { safeFileName } from '../../utils/searchQuery.js';
import { createResultAccumulator } from './resultAccumulator.js';
import { withSearchClient } from './searchSession.js';
export async function runBatchSearch({ id, queries, field, formats, folder, searchService, fileService, prepareExport, exportResults, isCancelled, onLog }) {
  await withSearchClient(searchService, id, async () => {
    if (!isCancelled()) await prepareExport?.();
    for (const [index, value] of queries.entries()) {
      if (isCancelled()) break;
      onLog('Запрос ' + (index + 1) + ' из ' + queries.length);
      try {
        const accumulator = createResultAccumulator({ deduplicate: false });
        const results = [];
        let recordCount = 0;
        const response = await searchService.search(id, { [field]: value }, {
          onChunk(chunk) {
            results.push(...accumulator.append(chunk));
            recordCount += chunk.filter((item) => item.object_data).length;
          },
        });
        if (isCancelled() || response.meta?.cancelled) break;
        onLog('Получено записей: ' + recordCount + (response.meta?.partial ? ' · индекс ещё обновляется, выдача частичная' : ''));
        for (const formatId of formats) {
          if (isCancelled()) break;
          const format = getExportFormat(formatId);
          const fileName = (index + 1) + '-' + safeFileName(value, 'result') + '.' + format.extension;
          const content = await exportResults(results, format.fsFormat);
          if (isCancelled()) break;
          await fileService.writeFile(content, folder + '/' + fileName);
          onLog('Сохранено: ' + fileName);
        }
      } catch (error) {
        if (!isCancelled()) onLog('Ошибка запроса ' + (index + 1) + ': ' + error.message);
      }
    }
    onLog(isCancelled() ? 'Поиск остановлен. Готовые файлы сохранены.' : 'Пакетный поиск завершён.');
  }, { onCleanupError: (error) => onLog('Не удалось закрыть соединение: ' + error.message) });
}
