import assert from 'node:assert/strict';
import test from 'node:test';
import { SearchService } from '../../../src/renderer/services/SearchService.js';

test('renderer delivers progress only to its tab and rejects another search until cancellation settles', async () => {
  let listener, complete;
  let removed = 0,
    cancelled = 0,
    calls = 0;
  const api = {
    createClient: async () => ({ status: 'running' }),
    onProgress: (callback) => {
      listener = callback;
      return () => {
        removed++;
      };
    },
    run: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
    cancel: () => {
      cancelled++;
    },
  };
  const service = new SearchService(api);
  await service.createClient(1);
  const received = [];
  const searching = service.search(
    1,
    { number: '70000000000' },
    { onChunk: (items, count) => received.push({ items, count }) },
  );

  listener({ tabId: 2, type: 'chunk', items: ['wrong'], received: 1 });
  listener({ tabId: 1, type: 'chunk', items: ['right'], received: 1 });
  service.cancelSearch(1);
  await assert.rejects(service.search(1, {}), /уже выполняется/);
  complete({ cancelled: true });
  const result = await searching;

  assert.deepEqual(received, [{ items: ['right'], count: 1 }]);
  assert.equal(cancelled, 1);
  assert.equal(calls, 1);
  assert.equal(removed, 1);
  assert.equal(service.isSearching[1], false);
  assert.equal(result.meta.cancelled, true);
});

test('renderer removes progress listener when server rejects the request', async () => {
  let removed = false;
  const service = new SearchService({
    createClient: async () => ({}),
    onProgress: () => () => {
      removed = true;
    },
    run: async () => {
      throw new Error('server unavailable');
    },
  });
  await service.createClient(1);

  await assert.rejects(service.search(1, {}), /server unavailable/);

  assert.equal(removed, true);
  assert.equal(service.isSearching[1], false);
});

test('listener setup failure releases the tab so a subsequent search can run', async () => {
  let failSetup = true;
  const service = new SearchService({
    createClient: async () => ({}),
    onProgress() {
      if (failSetup) throw new Error('listener unavailable');
      return () => {};
    },
    run: async () => ({ returned_hits: '0' }),
  });
  await service.createClient(1);
  await assert.rejects(service.search(1, {}), /listener unavailable/);
  failSetup = false;
  assert.equal((await service.search(1, {})).meta.returned_hits, '0');
});

test('listener cleanup failure releases the tab and preserves the request error', async () => {
  const service = new SearchService({
    createClient: async () => ({}),
    onProgress: () => () => { throw new Error('listener cleanup failed'); },
    run: async () => { throw new Error('request failed'); },
  });
  await service.createClient(1);
  await assert.rejects(service.search(1, {}), /request failed/);
  assert.equal(service.isSearching[1], false);
});
