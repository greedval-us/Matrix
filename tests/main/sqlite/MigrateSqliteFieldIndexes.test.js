import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { LsmSqliteIndexStore, FIELD_STORAGE_MODE } from "../../../src/main/sqlite/LsmSqliteIndexStore.js";
import { migrateSqliteFieldIndexes, pruneMigratedSqliteIndexes } from "../../../src/main/sqlite/MigrateSqliteFieldIndexes.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

function document(docId, fileName, byteOffset, indexTerms) {
  return { docId, fileName, byteOffset, byteLength: 25, sourceTable: "people", indexTerms };
}

test("field migration resumes from SQLite shards without reading JSONL", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-field-migration-"));
  const paths = new LocalDatabasePaths(rootPath);
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  await fs.mkdir(paths.stateDir);
  const repository = new LocalDatabaseStateRepository();
  const base = new SqliteIndexStore({ paths });
  await base.writeBatch([document("people:1", "old.jsonl", 1, { number: ["70001112233"] })]);
  base.close();
  const newer = new SqliteIndexStore({ paths, indexesDir: paths.getSqliteSegmentDir("segment-000001") });
  await newer.writeBatch([
    document("people:1", "new.jsonl", 2, { number: ["70001112233"], passport: ["1234567890"] }),
    document("people:2", "new.jsonl", 3, { mail: ["x@example.org"] }),
  ]);
  newer.close();
  const state = {
    formatVersion: 3,
    status: "completed",
    indexedDocuments: 3,
    storage: { mode: "lsm-v1", segments: [{ id: "segment-000001" }] },
  };
  await repository.writeSqliteIndexState(paths, state);

  const first = await migrateSqliteFieldIndexes({ paths, stateRepository: repository, maxShards: 1 });
  assert.equal(first.status, "paused");
  assert.equal((await repository.readSqliteIndexState(paths)).storage.mode, "lsm-v1");
  const resumed = await migrateSqliteFieldIndexes({ paths, stateRepository: repository });
  assert.equal(resumed.status, "completed");
  const migrated = await repository.readSqliteIndexState(paths);
  assert.equal(migrated.storage.mode, FIELD_STORAGE_MODE);
  const search = new LsmSqliteIndexStore({ paths });
  search.configure(migrated);
  for (const [field, term] of [
    ["number", "70001112233"],
    ["passport", "1234567890"],
    ["mail", "x@example.org"],
  ]) {
    assert.equal(search.queryField(field, term, 10).length, field === "number" ? 1 : 1);
  }
  const pointers = search.loadDocumentPointers(search.queryField("number", "70001112233", 10));
  assert.equal(pointers[0].file_name, "new.jsonl");
  assert.equal(pointers[0].byte_offset, 2);
  search.prepareWrite(migrated, 1);
  await search.writeBatch([document("people:3", "later.jsonl", 4, { inn: ["123456789012"] })]);
  search.recordWrite(migrated, 1);
  assert.equal(search.queryField("inn", "123456789012", 10).length, 1);
  search.close();
  assert.equal((await fs.stat(paths.getSqliteSegmentDir("segment-000001"))).isDirectory(), true);
  await pruneMigratedSqliteIndexes({ paths, stateRepository: repository });
  assert.equal(await fs.stat(paths.sqliteSegmentsDir).then(() => true, () => false), false);
  const afterCleanup = new LsmSqliteIndexStore({ paths });
  afterCleanup.configure(migrated);
  assert.equal(afterCleanup.queryField("mail", "x@example.org", 10).length, 1);
  assert.equal(afterCleanup.queryField("inn", "123456789012", 10).length, 1);
  afterCleanup.close();
});
