import assert from 'node:assert/strict';
import test from 'node:test';
import { FileService } from '../../../src/renderer/services/FileService.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('FileService stays loading until overlapping operations finish', async () => {
  const reading = deferred();
  const selecting = deferred();
  const service = new FileService(
    { openFolder: () => selecting.promise },
    { read: () => reading.promise },
  );
  const read = service.readFile('C:/query.txt');
  const folder = service.openFolder();
  assert.equal(service.isLoading, true);

  reading.resolve('Иван');
  assert.equal(await read, 'Иван');
  assert.equal(service.isLoading, true);

  selecting.resolve('C:/exports');
  assert.equal(await folder, 'C:/exports');
  assert.equal(service.isLoading, false);
});

test('FileService propagates errors and releases its loading state', async () => {
  const failure = new Error('Read failed');
  const service = new FileService({}, { read: async () => { throw failure; } });

  await assert.rejects(service.readFile('C:/query.txt'), failure);
  assert.equal(service.isLoading, false);
  assert.equal(service.currentData, null);
});

test('FileService releases a rejected operation while another operation remains pending', async () => {
  const reading = deferred();
  const selecting = deferred();
  const service = new FileService(
    { openFolder: () => selecting.promise },
    { read: () => reading.promise },
  );
  const read = service.readFile('C:/query.txt');
  const folder = service.openFolder();

  reading.reject(new Error('Read failed'));
  await assert.rejects(read, /Read failed/);
  assert.equal(service.isLoading, true);

  selecting.resolve(null);
  assert.equal(await folder, null);
  assert.equal(service.isLoading, false);
});

test('FileService cancellation preserves the current file and data', async () => {
  const service = new FileService(
    { openFile: async () => null },
    { saveDialog: async () => null },
  );
  service.currentFilePath = 'C:/existing.txt';
  service.currentData = 'Иван';

  assert.equal(await service.openFile(), null);
  assert.equal(await service.saveFile(), null);
  assert.equal(service.currentFilePath, 'C:/existing.txt');
  assert.equal(service.currentData, 'Иван');
  assert.equal(service.isLoading, false);
});

test('FileService writes Unicode text and both binary representations through the injected API', async () => {
  const written = [];
  const service = new FileService({}, {
    write: async (...args) => written.push(args),
  });
  const bytes = new Uint8Array([1, 2, 3]);
  const buffer = bytes.buffer;

  await service.writeFile('Иван 😃', 'C:/result.txt');
  await service.writeFile(bytes, 'C:/result.pdf');
  await service.writeFile(buffer, 'C:/result.xlsx');

  assert.deepEqual(written, [
    ['C:/result.txt', 'Иван 😃', false],
    ['C:/result.pdf', bytes, true],
    ['C:/result.xlsx', buffer, true],
  ]);
  assert.equal(service.currentData, buffer);
  assert.equal(service.isLoading, false);
});

test('FileService resolves desktop APIs when used, after construction without a window', async (t) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  delete globalThis.window;
  const service = new FileService();
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else delete globalThis.window;
  });
  globalThis.window = {
    fileDialog: { openFile: async () => 'C:/query.txt' },
    fileAPI: { read: async () => 'Иван' },
  };

  assert.deepEqual(await service.openFile(), { filePath: 'C:/query.txt', data: 'Иван' });
  assert.equal(service.currentFilePath, 'C:/query.txt');
  assert.equal(service.currentData, 'Иван');
  assert.equal(service.isLoading, false);
});
