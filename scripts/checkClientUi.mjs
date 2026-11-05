import assert from 'node:assert/strict';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createServer } from 'vite';

// Compile and render the extracted presentation components without Electron or a server.
const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: 'custom',
  logLevel: 'error',
});

async function renderComponent(path, props) {
  const { default: component } = await vite.ssrLoadModule(path);
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/', component: { render: () => null } },
    { path: '/settings', component: { render: () => null } },
  ] });
  const app = createSSRApp({ render: () => h(component, props) });
  app.use(router);
  app.config.warnHandler = message => { throw new Error(message); };
  await router.push('/');
  await router.isReady();
  return renderToString(app);
}

try {
  const card = await renderComponent('/components/search/SearchSourceCard.vue', {
    base: { source: 'A', name: '<Source>', info: 'Details', trust: '1', data:
      Array.from({ length: 52 }, (_, index) => [['number', index === 0 ? '<unsafe>' : String(index)]]) },
    fieldLabel: () => 'Телефон',
    visibleCount: 50,
    saved: true,
  });
  assert.equal((card.match(/class="mx-eyebrow mb-3"/g) || []).length, 50);
  assert.match(card, /&lt;unsafe&gt;/);
  assert.match(card, /&lt;Source&gt;/);
  assert.match(card, /Показать ещё 50/);
  assert.match(card, /Доступна/);
  assert.match(card, /Сохранено в заметки/);

  const status = await renderComponent('/components/search/SearchResultsStatus.vue', {
    hasSearched: true, loading: false, error: 'offline', received: 3, recordCount: 2,
    meta: { partial: true, indexed_shards: 1, total_shards: 4 },
  });
  assert.match(status, /offline/);
  assert.match(status, /Частичная выдача/);
  assert.match(status, /Повторить запрос/);
  assert.match(status, /Запрос не завершён/);

  const suggestions = await renderComponent('/components/search/SearchSuggestions.vue', {
    suggestions: [{ fieldKey: 'number', fieldValue: '<123>', preload: { number: { key: 'number', value: '<123>' } } }],
    fieldLabel: () => 'Телефон',
  });
  assert.match(suggestions, /Телефон/);
  assert.match(suggestions, /&lt;123&gt;/);
  assert.match(suggestions, /Поиск в новой вкладке/);
  const records = await renderComponent('/components/records/RecordsTable.vue', {
    available: true,
    columns: [{ key: 'files', label: '<Dynamic column>' }, { key: '__proto__', label: 'Special key' }],
    rows: [{ id: 'row-1', values: JSON.parse('{"files":"<unsafe>","__proto__":false}'),
      files: [{ id: 'file-1', name: '<script>.pdf', size: 0 }] }],
    sort: { key: 'files', direction: 'asc' },
    capabilities: { upload: true, download: false, remove: false },
  });
  assert.match(records, /&lt;Dynamic column&gt;/);
  assert.match(records, /&lt;unsafe&gt;/);
  assert.match(records, /&lt;script&gt;\.pdf/);
  assert.match(records, /aria-sort="ascending"/);
  assert.match(records, /Нет/);
  assert.match(records, /0 Б/);
  assert.doesNotMatch(records, /<script>/);
  assert.equal((records.match(/class="records-cell/g) || []).length, 3);
  assert.match(records, /aria-label="Скачать файл [^"]+"[^>]*disabled/);
  assert.match(records, /aria-label="Удалить файл [^"]+"[^>]*disabled/);
  const reportData = {
    seedQuery: { number: '<unsafe seed>' }, complete: false, cancelled: false,
    stats: { records: 2, queries: 3, sources: 1, duplicates: 4 }, warnings: ['<partial warning>'],
    identifiers: [{ field: 'passport', value: '<document>', sources: ['source'] }],
    sources: [{ id: 'source', name: '<Report source>', info: '<Source info>' }],
    records: [{ id: 'record-1', fields: [['number', '<unsafe seed>']] }],
  };
  const report = await renderComponent('/components/report/ReportPanel.vue', {
    state: { loading: false, saving: false, report: reportData, error: '', notice: '' },
  });
  assert.match(report, /Отчёт собран частично/);
  assert.match(report, /Полнота сбора не подтверждена/);
  assert.match(report, /Сохранить DOCX/);
  assert.match(report, /&lt;unsafe seed&gt;/);
  assert.match(report, /&lt;document&gt;/);
  assert.match(report, /&lt;Report source&gt;/);
  assert.match(report, /&lt;partial warning&gt;/);
  assert.doesNotMatch(report, /<document>|<Report source>/);
  const collectingReport = await renderComponent('/components/report/ReportPanel.vue', {
    state: { loading: true, stopping: false, report: null, error: '', progress: {
      query: { id: 'query-1', query: { passport: '<current document>' } }, stats: { queries: 1 },
    } },
  });
  assert.match(collectingReport, /Остановить сбор/);
  assert.match(collectingReport, /&lt;current document&gt;/);
  assert.doesNotMatch(collectingReport, /Сохранить DOCX/);
  const aggregateReport = await renderComponent('/components/report/ReportPanel.vue', {
    state: { loading: false, report: { ...reportData, records: [], identifiers: [],
      aggregates: [{ id: 'aggregate-1', key: 'region', items: [{ value: '<city>', count: 3 }] }],
      stats: { ...reportData.stats, records: 0, aggregates: 1 } } },
  });
  assert.match(aggregateReport, /Сводок сервера<\/dt><dd[^>]*>1<\/dd>/);
  assert.match(aggregateReport, /Сводные данные сервера: 1/);
  assert.match(aggregateReport, /Сохранить DOCX/);
  const batchReports = await renderComponent('/components/packages/PackageSearchForm.vue', {
    mode: 'report', queryText: '70000000000', searchField: 'number', formats: { txt: false }, isRunning: false,
  });
  assert.match(batchReports, /Один отчёт DOCX/);
  assert.match(batchReports, /Собрать отчёты/);
  assert.doesNotMatch(batchReports, /Форматы сохранения/);
  assert.doesNotMatch(batchReports, /<option[^>]+value="(?:fio|date_of_birth)"/);
  console.log('UI smoke passed: source pagination/escaping, status/errors, suggestions, dynamic records, attachment permissions and report collection.');
} finally {
  await vite.close();
}
