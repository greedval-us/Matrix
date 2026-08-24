import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SearchSqliteIndexesUseCase } from "../../../src/main/application/sqlite/SearchSqliteIndexesUseCase.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { SQLITE_INDEX_FORMAT_VERSION } from "../../../src/main/localdb/constants.js";
import { SearchTermService } from "../../../src/main/localdb/SearchTermService.js";
import { SqliteIndexStore } from "../../../src/main/sqlite/SqliteIndexStore.js";

test("SQLite search reads original JSONL and preserves application result format", async (t) => {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-sqlite-search-"));
  const paths = new LocalDatabasePaths(rootPath);
  const store = new SqliteIndexStore({ paths });
  t.after(() => {
    store.close();
    return fs.rm(rootPath, { recursive: true, force: true });
  });
  await Promise.all([paths.documentsDir, paths.metaDir, paths.stateDir].map((directory) =>
    fs.mkdir(directory, { recursive: true })
  ));
  await fs.writeFile(paths.databaseMetaPath, "{}", "utf8");
  const document = {
    docId: "people:1",
    sourceTable: "people",
    fields: { fio: "ИВАНОВ ИВАН", mail: "alpha@example.org" },
    invalidFields: {},
  };
  const line = JSON.stringify(document);
  await fs.writeFile(paths.getDocumentPath("people.jsonl"), `${line}\n`, "utf8");
  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeSqliteIndexState(paths, {
    formatVersion: SQLITE_INDEX_FORMAT_VERSION,
    status: "completed",
    indexedDocuments: 1,
  });
  await stateRepository.writeJson(paths.sourcesMetaPath, [
    { sourceTable: "people", name: "Люди", type: "contacts" },
  ]);
  await store.writeBatch([{
    docId: document.docId,
    sourceTable: document.sourceTable,
    fileName: "people.jsonl",
    byteOffset: 0,
    byteLength: Buffer.byteLength(line, "utf8"),
    indexTerms: { fio: ["ИВАНОВ ИВАН"], mail: ["alpha@example.org"] },
  }]);

  const useCase = new SearchSqliteIndexesUseCase({
    localDatabaseService: {
      getStoredRootPath: () => rootPath,
      ensureReady: async () => ({ initialized: true }),
    },
    stateRepository,
    jsonLinesRepository: new JsonLinesRepository(),
    termService: new SearchTermService(),
    indexStore: store,
    maxResults: 250,
  });
  const result = await useCase.execute({ fio: "Иванов Иван" });
  assert.equal(result[0].object_data_base.name, "Люди");
  assert.equal(result[1].object_data.fields.mail, "alpha@example.org");
});
