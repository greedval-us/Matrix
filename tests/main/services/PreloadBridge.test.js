import assert from 'node:assert/strict';
import test from 'node:test';
import { createPreloadApis } from '../../../src/shared/createPreloadApis.js';
import { IPC_CHANNELS } from '../../../src/shared/constants/ipcChannels.js';
import { assertRendererStoreKey } from '../../../src/main/services/rendererStorePolicy.js';

test('preload exposes fixed actions and strips privileged events from subscriptions', async () => {
  let listener;
  let removed;
  let request;
  const renderer = {
    invoke: async (...args) => { request = args; return 'ok'; },
    send() {},
    on(channel, handler) { assert.equal(channel, IPC_CHANNELS.search.progress); listener = handler; },
    removeListener(channel, handler) { removed = [channel, handler]; },
  };
  const apis = createPreloadApis(renderer);
  assert.equal(await apis.searchAPI.run('tab', { number: '123' }), 'ok');
  assert.deepEqual(request, [IPC_CHANNELS.search.run, 'tab', { number: '123' }]);
  let received;
  const unsubscribe = apis.searchAPI.onProgress((...args) => { received = args; });
  listener({ sender: 'privileged' }, { tabId: 'tab' });
  assert.deepEqual(received, [{ tabId: 'tab' }]);
  unsubscribe();
  assert.deepEqual(removed, [IPC_CHANNELS.search.progress, listener]);
  assert.equal('invoke' in apis.searchAPI, false);
});

test('generic renderer storage accepts collections and blocks connection secrets', () => {
  assert.equal(assertRendererStoreKey('notes'), 'notes');
  assert.throws(() => assertRendererStoreKey('searchServer'), /недоступ/);
  assert.throws(() => assertRendererStoreKey('searchServer.apiKey'), /недоступ/);
  assert.throws(() => assertRendererStoreKey('__proto__'), /недоступ/);
});
