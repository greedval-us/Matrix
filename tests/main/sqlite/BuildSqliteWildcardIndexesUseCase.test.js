import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BuildSqliteWildcardIndexesUseCase } from "../../../src/main/application/sqlite/BuildSqliteWildcardIndexesUseCase.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import {
  SQLITE_INDEX_FORMAT_VERSION,
  SQLITE_TERM_SHARD_COUNT,
} from "../../../src/main/localdb/constants.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

test("SQLite wildcard build resumes shard-by-shard", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-wildcard-"));
  const paths = new LocalDatabasePaths(rootPath);
  const indexStore = new SqliteIndexStore({ paths });
  t.after(() => {
    indexStore.close();
    return fs.rm(rootPath, { recursive: true, force: true });
  });
  await Promise.all([paths.metaDir, paths.stateDir].map((directory) =>
    fs.mkdir(directory, { recursive: true })
  ));
  await fs.writeFile(paths.databaseMetaPath, "{}", "utf8");
  await indexStore.writeBatch([
    {
      docId: "people:1",
      sourceTable: "people",
      fileName: "people.jsonl",
      byteOffset: 0,
      byteLength: 10,
      indexTerms: { mail: ["alpha@example.org"] },
    },
    {
      docId: "people:2",
      sourceTable: "people",
      fileName: "people.jsonl",
      byteOffset: 11,
      byteLength: 10,
      indexTerms: { mail: ["beta@example.org"] },
    },
  ]);

  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeSqliteIndexState(paths, {
    formatVersion: SQLITE_INDEX_FORMAT_VERSION,
    status: "completed",
    indexedDocuments: 2,
    wildcard: { status: "pending", indexedDocuments: 0, completedShards: [] },
  });
  const create = () => new BuildSqliteWildcardIndexesUseCase({
    localDatabaseService: {
      getStoredRootPath: () => rootPath,
      ensureReady: async () => ({ initialized: true }),
    },
    stateRepository,
    indexStore,
  });

  const first = create();
  const cancelled = await first.execute({ onProgress(progress) {
    if (progress.shardsProcessed === 1) first.cancel();
  } });
  assert.equal(cancelled.wildcard.status, "cancelled");
  assert.equal(cancelled.wildcard.completedShards.length, 1);

  const completed = await create().execute();
  assert.equal(completed.wildcard.status, "completed");
  assert.equal(completed.wildcard.completedShards.length, SQLITE_TERM_SHARD_COUNT);
  assert.equal(indexStore.queryField("mail", "%example%", 10).length, 2);
});
