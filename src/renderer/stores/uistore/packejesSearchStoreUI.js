import { defineStore } from 'pinia';
import { ref } from 'vue';
import { FileService } from '../../services/FileService.js';
import { SearchService } from '../../services/SearchService.js';
import { ResultParser } from '../../utils/ResultParser.js';
import { iconsSerchs } from '../../../shared/constants/searchItems.js';

export function safeFileName(value, fallback) {
  const name = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/[. ]+$/g, '')
    .slice(0, 120);
  return name || fallback;
}

export const usePackagesSearchStoreUI = defineStore('packagesSearchUI', () => {
  const searchService = new SearchService(window.searchAPI);
  const fileService = new FileService(window.fileDialog, window.fileAPI);
  const parser = new ResultParser();
  const queryText = ref('');
  const searchField = ref('number');
  const formats = ref({ txt: true, pdf: false, csv: false, excel: false });
  const logs = ref([]);
  const isRunning = ref(false);
  let cancelled = false;
  let activeTabId = null;
  let exporter;
  const addLog = (message) => logs.value.push(message);
  const setQuery = (value) => {
    queryText.value = value;
  };
  function toggleFormat(key) {
    if (key in formats.value) formats.value[key] = !formats.value[key];
  }
  async function openFile() {
    try {
      const result = await fileService.openFile();
      if (result) {
        queryText.value = result.data;
        addLog('Файл загружен: ' + result.filePath);
      }
    } catch (error) {
      addLog('Не удалось открыть файл: ' + error.message);
    }
  }
  function cancelSearch() {
    cancelled = true;
    if (activeTabId) searchService.cancelSearch(activeTabId);
    addLog('Останавливаем поиск…');
  }
  async function runSearch() {
    if (isRunning.value) return;
    const lines = queryText.value.split(/\r?\n/).filter((line) => line.trim());
    const selectedFormats = Object.keys(formats.value).filter((key) => formats.value[key]);
    if (!lines.length) {
      addLog('Введите хотя бы одно значение для поиска.');
      return;
    }
    if (!selectedFormats.length) {
      addLog('Выберите хотя бы один формат для экспорта.');
      return;
    }
    const field = searchField.value;
    isRunning.value = true;
    cancelled = false;
    activeTabId = 'package-' + Date.now();

    try {
      const folder = await fileService.openFolder();
      if (!folder || cancelled) {
        addLog('Пакетный поиск отменён.');
        return;
      }
      addLog('Результаты будут сохранены: ' + folder);
      await searchService.createClient(activeTabId);
      if (!exporter) {
        const { default: ExportManager } = await import('../../services/export/MenegerExport.js');
        exporter = new ExportManager();
      }
      for (const [index, line] of lines.entries()) {
        if (cancelled) break;
        addLog('Запрос ' + (index + 1) + ' из ' + lines.length);
        try {
          const items = [];
          const response = await searchService.search(
            activeTabId,
            { [field]: line },
            { onChunk: (chunk) => items.push(...chunk) },
          );
          if (cancelled || response.meta?.cancelled) break;
          const normalized = items.map((item) => parser.parse(item));
          const count = items.filter((item) => item.object_data).length;
          addLog(
            'Получено записей: ' +
              count +
              (response.meta?.partial ? ' · индекс ещё обновляется, выдача частичная' : ''),
          );
          for (const format of selectedFormats) {
            if (cancelled) break;
            const extension = format === 'excel' ? 'xlsx' : format;
            const fileName = index + 1 + '-' + safeFileName(line, 'result') + '.' + extension;
            const content = await exporter.export(normalized, format + 'Fs');
            await fileService.writeFile(content, folder + '/' + fileName);
            addLog('Сохранено: ' + fileName);
          }
        } catch (error) {
          if (!cancelled) addLog('Ошибка запроса ' + (index + 1) + ': ' + error.message);
        }
      }
      addLog(cancelled ? 'Поиск остановлен. Готовые файлы сохранены.' : 'Пакетный поиск завершён.');
    } catch (error) {
      addLog('Не удалось выполнить поиск: ' + error.message);
    } finally {
      try {
        await searchService.destroyClient(activeTabId);
      } catch (error) {
        addLog('Не удалось закрыть соединение: ' + error.message);
      }
      activeTabId = null;
      isRunning.value = false;
    }
  }
  function resetState() {
    if (isRunning.value) return;
    queryText.value = '';
    searchField.value = 'number';
    formats.value = { txt: true, pdf: false, csv: false, excel: false };
    logs.value = [];
    fileService.clear();
  }
  return {
    queryText,
    searchField,
    formats,
    logs,
    isRunning,
    setQuery,
    addLog,
    toggleFormat,
    openFile,
    runSearch,
    cancelSearch,
    resetState,
  };
});
