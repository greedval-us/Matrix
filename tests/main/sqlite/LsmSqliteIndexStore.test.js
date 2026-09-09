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
