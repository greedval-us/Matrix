import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordsService as MainRecordsService } from '../../../src/main/services/RecordsService.js';
import { RecordsService as RendererRecordsService } from '../../../src/renderer/services/RecordsService.js';

const services = {
  main: value => new MainRecordsService({ repository: { getCapabilities: async () => value } }),
  renderer: value => new RendererRecordsService({ getApi: () => ({ getCapabilities: async () => value }) }),
};

for (const [layer, createService] of Object.entries(services)) {
  test(`${layer} disables all record operations when availability is not explicitly true`, async () => {
    for (const available of [false, undefined, 1, 'true']) {
      const service = createService({ available, list: true, upload: true, download: true, remove: true,
        create: true, update: true, delete: true, message: 'Unavailable for this connection', internalPath: '/private' });

      assert.deepEqual(await service.getCapabilities(), {
        available: false, list: false, upload: false, download: false, remove: false,
        create: false, update: false, delete: false, message: 'Unavailable for this connection',
      });
    }
  });

  test(`${layer} enables only explicitly supported record operations`, async () => {
    const service = createService({ available: true, list: true, upload: 1, download: 'true',
      remove: false, create: true, update: true, message: null, internalPath: '/private' });

    assert.deepEqual(await service.getCapabilities(), {
      available: true, list: true, upload: false, download: false, remove: false,
      create: true, update: true, delete: false, message: '',
    });
  });

  test(`${layer} treats a missing capability response as unavailable`, async () => {
    for (const value of [null, undefined]) {
      assert.deepEqual(await createService(value).getCapabilities(), {
        available: false, list: false, upload: false, download: false, remove: false,
        create: false, update: false, delete: false,
        message: 'Данные появятся после подключения серверного API этого раздела.',
      });
    }
  });
}
