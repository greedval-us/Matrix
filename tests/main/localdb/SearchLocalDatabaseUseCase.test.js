import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { SearchLocalDatabaseUseCase } from "../../../src/main/application/localdb/SearchLocalDatabaseUseCase.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../../../src/main/localdb/SearchTermService.js";

test("SearchLocalDatabaseUseCase returns matching local source and records", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.getIndexFieldDir("number"), { recursive: true });
  await fs.mkdir(paths.documentLookupDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });

  await stateRepository.writeJson(
    paths.sourcesMetaPath,
    [{ sourceTable: "people", fileName: "people.json", importedAt: "2026-07-20T10:00:00.000Z" }]
  );
  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", "79"),
    [JSON.stringify({ term: "79991234567", docId: "people:1" })]
  );
  await jsonLinesRepository.appendLines(
    paths.getDocumentLookupBucketPath("pe"),
    [
      JSON.stringify({
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: { number: "79991234567", fio: "ИВАНОВ ИВАН" },
        invalidFields: {},
      }),
    ]
  );

  const fakeLocalDatabaseService = {
    getStoredRootPath() {
      return dbRoot;
    },
    async ensureReady() {
      return { initialized: true, rootPath: dbRoot };
    },
  };

  const useCase = new SearchLocalDatabaseUseCase({
    localDatabaseService: fakeLocalDatabaseService,
    stateRepository,
    jsonLinesRepository,
    termService: new SearchTermService(),
  });

  const results = await useCase.execute({ number: "+7 (999) 123-45-67" });

  assert.equal(results.length, 2);
  assert.equal(results[0].object_data_base.name_table, "people");
  assert.equal(results[1].object_data.source_name, "people");

  await fs.rm(tempRoot, { recursive: true, force: true });
});
