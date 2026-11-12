import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordsService } from '../../../src/main/services/RecordsService.js';
import { RecordsHandler } from '../../../src/main/ipc/RecordsHandler.js';
import { createPreloadApis } from '../../../src/shared/createPreloadApis.js';
import { IPC_CHANNELS } from '../../../src/shared/constants/ipcChannels.js';

const capabilities = { available: true, list: true, create: true, update: true, delete: true };
const row = { id: '9007199254740993', values: { number: '001', fio: 'Запись' }, files: [] };

test('main validates control writes and returns confirmed rows without exposing repository extras', async () => {
  const calls = [];
  const repository = { getCapabilities: async () => capabilities,
    createRecord: async payload => { calls.push(payload); return { ...row, internalPath: 'private' }; },
    updateRecord: async payload => { calls.push(payload); return row; },
    deleteRecord: async payload => { calls.push(payload); return { deleted: true }; },
  };
  const service = new RecordsService({ repository });
  assert.equal((await service.getCapabilities()).create, true);
  const values = { fio: 'Запись', number: '001', date_of_birth: 'около 1980 года' };
  assert.deepEqual(await service.createRecord({ values, path: 'discard' }), row);
  assert.deepEqual(await service.updateRecord({ rowId: row.id, values: { note: '' }, apiKey: 'discard' }), row);
  assert.deepEqual(await service.deleteRecord({ rowId: row.id, fileId: 'discard' }), { deleted: true });
  assert.deepEqual(calls, [{ values }, { rowId: row.id, values: { note: '' } }, { rowId: row.id }]);
  for (const invalid of [{ id: '1' }, { files: '[]' }, { arbitrary: 'value' }, { date: '2025-02-29' }]) {
    await assert.rejects(service.createRecord({ values: invalid }));
  }
  assert.equal(calls.length, 3);
})

test('main refuses missing capabilities and unconfirmed deletion', async () => {
  const forbidden = new RecordsService({ repository: { getCapabilities: async () => ({ available: true, list: true }), createRecord: () => assert.fail('must not write') } });
  await assert.rejects(forbidden.createRecord({ values: {} }), /недоступ/i);
  const uncertain = new RecordsService({ repository: { getCapabilities: async () => capabilities, deleteRecord: async () => ({ deleted: false }) } });
  await assert.rejects(uncertain.deleteRecord({ rowId: '1' }), /подтвердил/);
})

test('CRUD preload and handlers expose only named operations and validate sender first', async () => {
  const invoked = [];
  const { recordsAPI } = createPreloadApis({ invoke: async (...args) => invoked.push(args) });
  await recordsAPI.createRecord({ values: { fio: 'Тест' } });
  await recordsAPI.updateRecord({ rowId: '1', values: { note: 'Текст' } });
  await recordsAPI.deleteRecord({ rowId: '1' });
  assert.deepEqual(invoked.map(call => call[0]), [IPC_CHANNELS.records.createRecord, IPC_CHANNELS.records.updateRecord, IPC_CHANNELS.records.deleteRecord]);
  const requests = new Map();
  const ipc = { handle: (key, fn) => requests.set(key, fn), removeHandler: key => requests.delete(key) };
  let writes = 0;
  const handler = new RecordsHandler({ createRecord: async () => { writes += 1; return row; } }, {
    ipc, wrap: (_key, fn) => fn, assertSender: event => { if (!event.trusted) throw new Error('untrusted'); },
  });
  handler.register();
  assert.throws(() => requests.get(IPC_CHANNELS.records.createRecord)({ trusted: false }, { values: {} }), /untrusted/);
  await requests.get(IPC_CHANNELS.records.createRecord)({ trusted: true }, { values: {} });
  assert.equal(writes, 1);
  await handler.shutdown();
  assert.equal(requests.size, 0);
})
