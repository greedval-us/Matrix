import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ListLocalSourcesUseCase } from "../../../src/main/application/localdb/ListLocalSourcesUseCase.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";

test("ListLocalSourcesUseCase returns source metadata when present", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sources-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();

  await fs.mkdir(paths.metaDir, { recursive: true });
  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "beeline_2019",
      name: 'ПАО "Вымпел Коммуникации"',
      description: "Список клиентов провайдера домашнего интернета",
      type: "Услуги",
      country: "RU",
      accessLevel: 0,
      documentsImported: 10871294,
      importedAt: "2026-07-20T09:45:05.035Z",
      createdAt: "2025-02-28 09:56:55",
      updatedAt: "2025-07-30 08:38:57",
      relevanceDate: 2019,
      trust: 1,
      searchFields: {
        fio: true,
        number: true,
        mail: false,
      },
    },
  ]);

  const useCase = new ListLocalSourcesUseCase({
    localDatabaseService: {
      getStoredRootPath() {
        return dbRoot;
      },
      async ensureReady() {
        return { initialized: true, rootPath: dbRoot };
      },
    },
    stateRepository,
  });

  const rows = await useCase.execute();

  assert.equal(rows.length, 1);
  assert.equal(rows[0].name_table, "beeline_2019");
  assert.equal(rows[0].name, 'ПАО "Вымпел Коммуникации"');
  assert.equal(rows[0].info, "Список клиентов провайдера домашнего интернета");
  assert.equal(rows[0].type, "Услуги");
  assert.equal(rows[0].country, "RU");
  assert.equal(rows[0].count, "10871294");
  assert.equal(rows[0].search_mail, "false");
  assert.equal(rows[0].search_fio, "true");
  assert.equal(rows[0].search_number, "true");

  await fs.rm(tempRoot, { recursive: true, force: true });
});
