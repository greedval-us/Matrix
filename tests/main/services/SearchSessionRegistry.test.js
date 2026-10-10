import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { SearchSessionRegistry, withTemporaryClient } from '../../../src/main/services/SearchSessionRegistry.js';

function pendingClient() {
  let resolve;
  const ready = new Promise((complete) => { resolve = complete; });
  return { connect: () => ready, disposeCount: 0, dispose() { this.disposeCount += 1; }, resolve };
}

test('destroying a connecting tab cannot resurrect its client', async () => {
  const client = pendingClient();
  const sessions = new SearchSessionRegistry({ createClient: () => client });
  const owner = { id: 1 };
  const creating = sessions.create('tab', owner);
  const rejected = assert.rejects(creating, /закрыт/);
  await sessions.destroy('tab', owner);
  client.resolve({ status: 'running' });
  await rejected;
  assert.equal(sessions.get('tab', owner), undefined);
  assert.equal(client.disposeCount, 1);
});

test('reset invalidates pending connections and isolates tab ownership by renderer', async () => {
  const clients = [pendingClient(), pendingClient()];
  let next = 0;
  const sessions = new SearchSessionRegistry({ createClient: () => clients[next++] });
  const first = sessions.create('same-tab', { id: 1 });
  const second = sessions.create('same-tab', { id: 2 });
  const rejected = [assert.rejects(first, /закрыт/), assert.rejects(second, /закрыт/)];
  await sessions.reset();
  clients.forEach((client) => client.resolve({ status: 'running' }));
  await Promise.all(rejected);
  assert.deepEqual(clients.map((client) => client.disposeCount), [1, 1]);
});

test('renderer destruction disposes its connected clients', async () => {
  const owner = new EventEmitter();
  owner.id = 1;
  const client = pendingClient();
  client.resolve({ status: 'running' });
  const sessions = new SearchSessionRegistry({ createClient: () => client });
  await sessions.create('tab', owner);
  owner.emit('destroyed');
  await new Promise(setImmediate);
  assert.equal(sessions.get('tab', owner), undefined);
  assert.equal(client.disposeCount, 1);
});

test('temporary client cleanup cannot replace an operation failure', async () => {
  const original = new Error('connection rejected');
  let disposed = false;
  await assert.rejects(withTemporaryClient(
    () => ({ dispose() { disposed = true; throw new Error('cleanup failed'); } }),
    async () => { throw original; },
  ), (error) => error === original);
  assert.equal(disposed, true);
});

test('replacing a pending client closes it and keeps only the replacement', async () => {
  const clients = [pendingClient(), pendingClient()];
  let next = 0;
  const owner = { id: 1 };
  const sessions = new SearchSessionRegistry({ createClient: () => clients[next++] });
  const first = sessions.create('tab', owner);
  const rejected = assert.rejects(first, /закрыт/);
  const second = sessions.create('tab', owner);
  clients[1].resolve({ status: 'running' });
  await second;
  clients[0].resolve({ status: 'running' });
  await rejected;
  assert.equal(sessions.get('tab', owner), clients[1]);
  assert.equal(clients[0].disposeCount, 1);
  await sessions.reset();
});

test('failed constructors and already destroyed renderers leave no owner listeners', async () => {
  const owner = new EventEmitter();
  owner.id = 1;
  owner.isDestroyed = () => false;
  const sessions = new SearchSessionRegistry({ createClient() { throw new Error('constructor failure'); } });
  await assert.rejects(sessions.create('tab', owner), /constructor failure/);
  assert.equal(owner.listenerCount('destroyed'), 0);
  assert.equal(sessions.owners.size, 0);
  owner.isDestroyed = () => true;
  await assert.rejects(sessions.create('tab', owner), /закрыт/);
  assert.equal(owner.listenerCount('destroyed'), 0);
});

test('configuration reset also disposes a temporary operation still connecting', async () => {
  const client = pendingClient();
  const owner = { id: 1 };
  const sessions = new SearchSessionRegistry({ createClient: () => client });
  const pending = sessions.withTemporary(owner, (service) => service.connect());
  const rejected = assert.rejects(pending, /закрыт/);
  await sessions.reset();
  client.resolve({ status: 'running' });
  await rejected;
  assert.equal(client.disposeCount, 1);
});

test('failed replacement constructor keeps the existing session owned and usable', async () => {
  const client = pendingClient();
  client.resolve({ status: 'running' });
  let attempts = 0;
  const sessions = new SearchSessionRegistry({ createClient() { if (attempts++) throw new Error('constructor failure'); return client; } });
  const owner = { id: 1 };
  await sessions.create('tab', owner);
  await assert.rejects(sessions.create('tab', owner), /constructor failure/);
  assert.equal(sessions.get('tab', owner), client);
  assert.equal(client.disposeCount, 0);
  await sessions.reset();
});
