import { defineStore } from 'pinia';
import { ref } from 'vue';
import { FileService } from '../../services/FileService.js';
import { SearchService } from '../../services/SearchService.js';
import { getFileApi, getFileDialogApi } from '../../infrastructure/desktopApi.js';
import { DEFAULT_SEARCH_FIELD } from '../../../shared/constants/searchItems.js';
import { EXPORT_FORMATS } from '../../services/export/exportFormats.js';
import { parseBatchQueries } from '../../utils/searchQuery.js';
import { createMonotonicIdGenerator } from '../../utils/monotonicId.js';
import { runBatchSearch } from '../../services/search/batchSearchRunner.js';
export { safeFileName } from '../../utils/searchQuery.js';

const DEFAULT_EXPORT_FORMAT = 'txt';
const createFormatSelection = () => Object.fromEntries(EXPORT_FORMATS.map(({ id }) => [id, id === DEFAULT_EXPORT_FORMAT]));
const nextBatchId = createMonotonicIdGenerator();

export const usePackagesSearchStoreUI = defineStore('packagesSearchUI', () => {
  const searchService = new SearchService();
  const fileService = new FileService(getFileDialogApi(), getFileApi());
  const queryText = ref('');
  const searchField = ref(DEFAULT_SEARCH_FIELD);
  const formats = ref(createFormatSelection());
  const logs = ref([]);
  const isRunning = ref(false);
  let cancelled = false;
  let activeTabId = null;
  let exporter;
  const addLog = (message) => logs.value.push(message);
  const setQuery = (value) => { queryText.value = value; };
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
    } catch (error) { addLog('Не удалось открыть файл: ' + error.message); }
  }
  function cancelSearch() {
    cancelled = true;
    if (activeTabId) searchService.cancelSearch(activeTabId);
    addLog('Останавливаем поиск…');
  }
  async function prepareExport() {
    if (!exporter) {
      const { default: ExportManager } = await import('../../services/export/MenegerExport.js');
      exporter = new ExportManager();
    }
  }
  async function runSearch() {
    if (isRunning.value) return;
    const queries = parseBatchQueries(queryText.value);
    const selectedFormats = Object.keys(formats.value).filter((key) => formats.value[key]);
    if (!queries.length) { addLog('Введите хотя бы одно значение для поиска.'); return; }
    if (!selectedFormats.length) { addLog('Выберите хотя бы один формат для экспорта.'); return; }
    const field = searchField.value;
    isRunning.value = true;
    cancelled = false;
    activeTabId = 'package-' + nextBatchId();
    try {
      const folder = await fileService.openFolder();
      if (!folder || cancelled) { addLog('Пакетный поиск отменён.'); return; }
      addLog('Результаты будут сохранены: ' + folder);
      await runBatchSearch({
        id: activeTabId, queries, field, formats: selectedFormats, folder, searchService, fileService,
        prepareExport, exportResults: (results, format) => exporter.export(results, format),
        isCancelled: () => cancelled, onLog: addLog,
      });
    } catch (error) { addLog('Не удалось выполнить поиск: ' + error.message); }
    finally { activeTabId = null; isRunning.value = false; }
  }
  function resetState() {
    if (isRunning.value) return;
    queryText.value = '';
    searchField.value = DEFAULT_SEARCH_FIELD;
    formats.value = createFormatSelection();
    logs.value = [];
    fileService.clear();
  }
  return { queryText, searchField, formats, logs, isRunning, setQuery, addLog, toggleFormat, openFile, runSearch, cancelSearch, resetState };
});
