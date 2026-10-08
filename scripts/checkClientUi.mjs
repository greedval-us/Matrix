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
  console.log('UI smoke passed: source pagination/escaping, status/errors, suggestions.');
} finally {
  await vite.close();
}
