import assert from 'node:assert/strict';
import test from 'node:test';
import { FileService } from '../../../src/renderer/services/FileService.js';

test('a failed binary report write cannot replace previous data or appear successful', async () => {
  const service = new FileService({}, { write: async () => false });
  service.currentData = 'previous data';
  await assert.rejects(service.writeFile(new Uint8Array([80, 75]), 'D:/report.docx'), /записать/);
  assert.equal(service.currentData, 'previous data');
  assert.equal(service.isLoading, false);
});
