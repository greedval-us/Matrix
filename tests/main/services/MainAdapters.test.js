import assert from 'node:assert/strict';
import test from 'node:test';
import { FileService } from '../../../src/main/services/FileService.js';
import { registerIpcHandlers } from '../../../src/main/ipc/registerIpcHandlers.js';

test('save dialog preserves requested format filters and cancellation', async () => {
  let options;
  const service = new FileService({ dialog: { showSaveDialog: async (value) => {
    options = value;
    return { canceled: true };
  } } });
  assert.equal(await service.saveFile('results.csv', [{ name: 'CSV', extensions: ['csv'] }]), null);
  assert.deepEqual(options, { defaultPath: 'results.csv', filters: [{ name: 'CSV', extensions: ['csv'] }] });
});

test('partial IPC registration failure removes only handlers registered by that attempt', () => {
  const requests = new Map([['occupied', () => 'other']]);
  const ipc = {
    handle(channel, handler) { if (requests.has(channel)) throw new Error('duplicate channel'); requests.set(channel, handler); },
    removeHandler(channel) { requests.delete(channel); },
    removeListener() {},
  };
  assert.throws(() => registerIpcHandlers(ipc, { first: () => true, occupied: () => false }), /duplicate channel/);
  assert.equal(requests.has('first'), false);
  assert.equal(requests.get('occupied')(), 'other');
});

test('IPC registrations remove handlers and cancellation listeners when disposed', () => {
  const handles = new Map();
  const events = new Map();
  const ipc = {
    handle: (channel, handler) => handles.set(channel, handler),
    on: (channel, handler) => events.set(channel, handler),
    removeHandler: (channel) => handles.delete(channel),
    removeListener: (channel, handler) => { if (events.get(channel) === handler) events.delete(channel); },
  };
  const dispose = registerIpcHandlers(ipc, { request: () => 42 }, { cancel: () => {} });
  assert.equal(handles.get('request')(), 42);
  dispose();
  dispose();
  assert.equal(handles.size, 0);
  assert.equal(events.size, 0);
});
