import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { SQLITE_TERM_SHARD_COUNT } from "../../../src/main/localdb/constants.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

test("SQLite shards support exact, prefix, infix and single-character wildcard search", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-store-"));
  const paths = new LocalDatabasePaths(rootPath);
  const store = new SqliteIndexStore({ paths });
  t.after(() => {
    store.close();
    return fs.rm(rootPath, { recursive: true, force: true });
  });

  await store.writeBatch([
    {
      docId: "people:1",
      sourceTable: "people",
      fileName: "people.jsonl",
      byteOffset: 10,
      byteLength: 20,
      indexTerms: { fio: ["ИВАНОВ ИВАН"], mail: ["alpha@example.org"] },
    },
    {
      docId: "people:2",
      sourceTable: "people",
      fileName: "people.jsonl",
      byteOffset: 31,
      byteLength: 22,
      indexTerms: { fio: ["ПЕТРОВ ПЕТР"], mail: ["beta@example.org"] },
    },
  ]);

  assert.equal(store.queryField("mail", "alpha@example.org", 10).length, 1);
  assert.equal(store.queryField("fio", "ИВАНОВ%", 10).length, 1);
  for (let index = 0; index < SQLITE_TERM_SHARD_COUNT; index += 1) {
    store.rebuildWildcardShard(index.toString(16).padStart(2, "0"));
  }
  assert.equal(store.queryField("mail", "%example%", 10).length, 2);
  assert.equal(store.queryField("fio", "ПЕТРОВ ПЕТ?", 10).length, 1);

  const keys = store.queryField("mail", "alpha@example.org", 10);
  const pointers = store.loadDocumentPointers(keys);
  assert.equal(pointers[0].doc_id, "people:1");
  assert.equal(pointers[0].byte_offset, 10);
});
