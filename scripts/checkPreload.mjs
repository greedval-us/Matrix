import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { IPC_CHANNELS } from '../src/shared/constants/ipcChannels.js';

const source = await readFile(new URL('../build/main/preload.cjs', import.meta.url), 'utf8');
const apis = {};
const calls = [];
const listeners = new Map();
const electron = {
  contextBridge: { exposeInMainWorld: (name, api) => { apis[name] = api; } },
  ipcRenderer: {
    invoke: async (channel, ...args) => { calls.push({ channel, args }); },
    send: (channel, ...args) => { calls.push({ channel, args }); },
    on: (channel, listener) => { listeners.set(channel, listener); },
    removeListener: (channel, listener) => {
      assert.equal(listeners.get(channel), listener);
      listeners.delete(channel);
    },
  },
};

vm.runInNewContext(source, {
  require(name) {
    assert.equal(name, 'electron', 'Sandboxed preload must not require runtime filesystem modules');
    return electron;
  },
}, { filename: 'preload.cjs' });
assert.deepEqual(Object.keys(apis).sort(), ['fileAPI', 'fileDialog', 'recordsAPI', 'searchAPI', 'storeAPI']);
await apis.recordsAPI.downloadFile({ rowId: 'row-1', fileId: 'file-1' });
assert.equal(calls.at(-1).channel, IPC_CHANNELS.records.downloadFile);
assert.equal(calls.at(-1).args[0].rowId, 'row-1');
assert.equal(calls.at(-1).args[0].fileId, 'file-1');
await apis.searchAPI.run(12, { number: '123' });
assert.equal(calls.at(-1).channel, IPC_CHANNELS.search.run);
assert.equal(calls.at(-1).args[0], 12);
assert.equal(calls.at(-1).args[1].number, '123');
apis.searchAPI.cancel(12);
assert.equal(calls.at(-1).channel, IPC_CHANNELS.search.cancel);
await apis.fileAPI.write('result.txt', 'value');
assert.equal(calls.at(-1).channel, IPC_CHANNELS.file.write);
assert.equal(calls.at(-1).args[0].isBinary, false);
let delivered;
const unsubscribe = apis.searchAPI.onProgress(payload => { delivered = payload; });
const payload = { tabId: 12, type: 'chunk' };
listeners.get(IPC_CHANNELS.search.progress)({ secretEvent: true }, payload);
assert.equal(delivered, payload);
unsubscribe();
assert.equal(listeners.size, 0);
console.log('Preload smoke passed: isolated bundle, public APIs, IPC payloads, listener cleanup.');
