import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BuildSqliteIndexesUseCase } from "../../../src/main/application/sqlite/BuildSqliteIndexesUseCase.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../../../src/main/localdb/SearchTermService.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

test("SQLite indexing resumes inside a JSONL file and accepts new files", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-index-"));
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  const paths = new LocalDatabasePaths(rootPath);
  await Promise.all([paths.documentsDir, paths.metaDir, paths.stateDir].map((directory) =>
    fs.mkdir(directory, { recursive: true })
  ));
  await fs.writeFile(paths.databaseMetaPath, "{}", "utf8");
  const records = Array.from({ length: 110 }, (_, index) => ({
    docId: `people:${index + 1}`,
    sourceTable: "people",
    fields: { number: `790000${String(index).padStart(5, "0")}` },
    invalidFields: {},
  }));
  await fs.writeFile(
    paths.getDocumentPath("people.jsonl"),
    `${records.map(JSON.stringify).join("\n")}\n`,
    "utf8"
  );

  const stateRepository = new LocalDatabaseStateRepository();
  const create = () => {
    const indexStore = new SqliteIndexStore({ paths });
    return { indexStore, useCase: new BuildSqliteIndexesUseCase({
      localDatabaseService: {
        getStoredRootPath: () => rootPath,
        ensureReady: async () => ({ initialized: true }),
      },
      stateRepository,
      jsonLinesRepository: new JsonLinesRepository(),
      termService: new SearchTermService(),
      indexStore,
      batchDocuments: 100,
    }) };
  };

  const first = create();
  let stopped = false;
  const cancelled = await first.useCase.execute({ onProgress(progress) {
    if (!stopped && progress.indexedDocuments >= 100) {
      stopped = true;
      first.useCase.cancel();
    }
  } });
  first.indexStore.close();
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.indexedDocuments, 100);
  assert.ok(cancelled.byteOffset > 0);

  const resumed = create();
  const completed = await resumed.useCase.execute();
  assert.equal(completed.status, "completed");
  assert.equal(completed.indexedDocuments, 110);
  assert.equal(resumed.indexStore.queryField("number", "79000000109", 10).length, 1);
  resumed.indexStore.close();

  const update = {
    docId: "updates:1",
    sourceTable: "updates",
    fields: { mail: "NEW@EXAMPLE.ORG" },
    invalidFields: {},
  };
  await fs.writeFile(paths.getDocumentPath("updates.jsonl"), `${JSON.stringify(update)}\n`, "utf8");
  const incremental = create();
  const result = await incremental.useCase.execute();
  assert.equal(result.filesTotal, 2);
  assert.equal(result.indexedDocuments, 111);
  assert.equal(incremental.indexStore.queryField("mail", "new@example.org", 10).length, 1);
  incremental.indexStore.close();
});
