import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LsmSqliteIndexStore } from "../../../src/main/sqlite/LsmSqliteIndexStore.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

function document(docId, term) {
  return {
    docId,
    sourceTable: "people",
    fileName: "people.jsonl",
    byteOffset: 0,
    byteLength: 10,
    indexTerms: { mail: [term] },
  };
}

function termInShard(store, shard, prefix) {
  for (let index = 0; ; index += 1) {
    const term = `${prefix}${index}@example.org`;
    if (store.getTermShard("mail", term) === shard) return term;
  }
}

test("LSM migration keeps the existing index as base and resumes in segments", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-lsm-"));
  const paths = new LocalDatabasePaths(rootPath);
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));

  const legacyStore = new SqliteIndexStore({ paths });
  await legacyStore.writeBatch([document("people:1", "base@example.org")]);
  legacyStore.close();

  const state = { indexedDocuments: 1 };
  const first = new LsmSqliteIndexStore({ paths });
  first.initializeStorage(state);
  assert.equal(state.storage.baseIndexedDocuments, 1);
  assert.deepEqual(state.storage.segments, []);

  first.prepareWrite(state, 1);
  await first.writeBatch([document("people:2", "segment@example.org")]);
  first.recordWrite(state, 1);
  state.indexedDocuments += 1;
  assert.equal(state.storage.segments[0].indexedDocuments, 1);
  first.close();

  const resumed = new LsmSqliteIndexStore({ paths });
  resumed.configure(state);
  assert.equal(resumed.queryField("mail", "base@example.org", 10).length, 1);
  assert.equal(resumed.queryField("mail", "segment@example.org", 10).length, 1);
  assert.equal(resumed.loadDocumentPointers([
    ...resumed.queryField("mail", "base@example.org", 10),
    ...resumed.queryField("mail", "segment@example.org", 10),
  ]).length, 2);
  resumed.close();
});

test("LSM rotates full segments without changing the base", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-lsm-rotate-"));
  const paths = new LocalDatabasePaths(rootPath);
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  const store = new LsmSqliteIndexStore({ paths });
  const state = { indexedDocuments: 0 };
  store.initializeStorage(state);
  state.storage.segmentMaxDocuments = 1;

  store.prepareWrite(state, 1);
  await store.writeBatch([document("people:1", "one@example.org")]);
  store.recordWrite(state, 1);
  state.indexedDocuments += 1;
  const firstSegmentId = state.storage.activeSegmentId;
  store.prepareWrite(state, 1);
  await store.writeBatch([document("people:2", "two@example.org")]);
  store.recordWrite(state, 1);

  assert.equal(state.storage.segments.length, 2);
  assert.equal(state.storage.segments[0].status, "sealed");
  assert.equal(state.storage.segments[1].status, "active");
  assert.equal(store.segmentStores.has(firstSegmentId), false);
  assert.equal(store.queryField("mail", "one@example.org", 10).length, 1);
  assert.equal(store.queryField("mail", "two@example.org", 10).length, 1);
  store.close();
});

test("LSM search uses only field shards while migration is in progress", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-lsm-hybrid-"));
  const paths = new LocalDatabasePaths(rootPath);
  t.after(() => fs.rm(rootPath, { recursive: true, force: true }));
  const segmentIds = ["segment-000001", "segment-000002"];
  const probe = new SqliteIndexStore({ paths });
  const newestTerm = termInShard(probe, "00", "newest");
  const olderTerm = termInShard(probe, "00", "older");
  const baseTerm = termInShard(probe, "00", "base");
  probe.close();

  const base = new SqliteIndexStore({ paths });
  await base.writeBatch([document("people:base", baseTerm)]);
  base.close();
  const older = new SqliteIndexStore({ paths, indexesDir: paths.getSqliteSegmentDir(segmentIds[0]) });
  await older.writeBatch([document("people:older", olderTerm)]);
  older.close();
  const newest = new SqliteIndexStore({ paths, indexesDir: paths.getSqliteSegmentDir(segmentIds[1]) });
  await newest.writeBatch([document("people:newest", newestTerm)]);
  newest.close();
  const migrated = new SqliteIndexStore({
    paths,
    indexesDir: paths.sqliteFieldIndexesDir,
    fieldScoped: true,
  });
  await migrated.writeBatch([document("people:newest", newestTerm)]);
  migrated.close();

  const state = {
    indexedDocuments: 3,
    storage: {
      mode: "lsm-v1",
      segments: segmentIds.map((id) => ({ id })),
    },
  };
  const migration = {
    version: 2,
    order: "target-shard-major",
    indexedDocuments: 3,
    sourceIds: [segmentIds[1], segmentIds[0], "base"],
    shardIndex: 0,
    sourceIndex: 1,
  };
  const hybrid = new LsmSqliteIndexStore({ paths });
  hybrid.configure(state, migration);
  const keys = hybrid.queryField("mail", newestTerm, 10);
  assert.equal(keys.length, 1);
  assert.equal(hybrid.queryField("mail", olderTerm, 10).length, 0);
  assert.equal(hybrid.queryField("mail", baseTerm, 10).length, 0);
  const pointers = hybrid.loadDocumentPointers(keys);
  assert.deepEqual(pointers.map((pointer) => pointer.doc_id), ["people:newest"]);
  hybrid.close();
});
