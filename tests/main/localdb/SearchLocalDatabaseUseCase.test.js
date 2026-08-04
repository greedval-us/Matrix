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

function buildCompactLookupEntries(fileName, records) {
  let byteOffset = 0;

  return records.map((record) => {
    const line = JSON.stringify(record);
    const entry = {
      docId: record.docId,
      fileName,
      byteOffset,
      byteLength: Buffer.byteLength(line, "utf8"),
    };
    byteOffset += entry.byteLength + 1;
    return { line, entry };
  });
}

async function seedCompactLookup({
  paths,
  stateRepository,
  jsonLinesRepository,
  termService,
  fileName,
  records,
  sharedNumber,
}) {
  const compactLookupEntries = buildCompactLookupEntries(fileName, records);
  const indexEntries = records.map((record) =>
    JSON.stringify({
      term: sharedNumber,
      docId: record.docId,
      sourceTable: record.sourceTable,
      rowId: record.rowId,
    })
  );

  await fs.mkdir(paths.getIndexFieldDir("number"), { recursive: true });
  await fs.mkdir(paths.documentLookupDir, { recursive: true });
  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });

  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      importedAt: "2026-07-20T10:00:00.000Z",
      name: "Р›СЋРґРё",
      description: "РўРµСЃС‚РѕРІР°СЏ Р»РѕРєР°Р»СЊРЅР°СЏ Р±Р°Р·Р°",
      type: "РљРѕРЅС‚Р°РєС‚С‹",
    },
  ]);

  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", termService.getBucketName(sharedNumber)),
    indexEntries
  );
  await jsonLinesRepository.appendLines(
    paths.getDocumentPath(fileName),
    compactLookupEntries.map(({ line }) => line)
  );
  await jsonLinesRepository.appendLines(
    paths.getDocumentLookupBucketPath(termService.getDocumentBucketName(records[0].docId)),
    compactLookupEntries.map(({ entry }) => JSON.stringify(entry))
  );
}

test("SearchLocalDatabaseUseCase returns matching local source and records", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const sharedNumber = "79991234567";

  await seedCompactLookup({
    paths,
    stateRepository,
    jsonLinesRepository,
    termService,
    fileName: "import_people.jsonl",
    sharedNumber,
    records: [
      {
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: { number: sharedNumber, fio: "РР’РђРќРћР’ РР’РђРќ" },
        invalidFields: {},
      },
    ],
  });

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
    termService,
  });

  const results = await useCase.execute({ number: "+7 (999) 123-45-67" });

  assert.equal(results.length, 2);
  assert.equal(results[0].object_data_base.name_table, "people");
  assert.equal(results[0].object_data_base.name, "Р›СЋРґРё");
  assert.equal(results[0].object_data_base.info, "РўРµСЃС‚РѕРІР°СЏ Р»РѕРєР°Р»СЊРЅР°СЏ Р±Р°Р·Р°");
  assert.equal(results[0].object_data_base.type, "РљРѕРЅС‚Р°РєС‚С‹");
  assert.equal(results[1].object_data.source_name, "people");

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase returns all matching records without truncation", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-all-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const sharedNumber = "79991234567";
  const totalMatches = 320;

  await seedCompactLookup({
    paths,
    stateRepository,
    jsonLinesRepository,
    termService,
    fileName: "import_people.jsonl",
    sharedNumber,
    records: Array.from({ length: totalMatches }, (_value, index) => ({
      docId: `people:${index + 1}`,
      sourceTable: "people",
      rowId: index + 1,
      fields: {
        number: sharedNumber,
        fio: `РРІР°РЅРѕРІ РРІР°РЅ ${index + 1}`,
      },
      invalidFields: {},
    })),
  });

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
    termService,
  });

  const results = await useCase.execute({ number: "+7 (999) 123-45-67" });
  const recordResults = results.filter((item) => item.object_data);

  assert.equal(results[0].object_data_base.name_table, "people");
  assert.equal(recordResults.length, totalMatches);
  assert.equal(recordResults[0].object_data.fields.number, sharedNumber);
  assert.equal(recordResults.at(-1).object_data.fields.number, sharedNumber);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase streams matched records in chunks and returns meta", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-stream-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const sharedNumber = "79991234567";
  const totalMatches = 320;
  const receivedChunks = [];

  await seedCompactLookup({
    paths,
    stateRepository,
    jsonLinesRepository,
    termService,
    fileName: "import_people.jsonl",
    sharedNumber,
    records: Array.from({ length: totalMatches }, (_value, index) => ({
      docId: `people:${index + 1}`,
      sourceTable: "people",
      rowId: index + 1,
      fields: {
        number: sharedNumber,
        fio: `Иванов Иван ${index + 1}`,
      },
      invalidFields: {},
    })),
  });

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
    termService,
  });

  const meta = await useCase.execute(
    { number: "+7 (999) 123-45-67" },
    {
      onChunk: async (items) => {
        receivedChunks.push(items);
      },
    }
  );

  assert.equal(receivedChunks.length, 2);
  assert.equal(receivedChunks[0].length, 200);
  assert.equal(receivedChunks[1].length, 121);
  assert.equal(receivedChunks[0][0].object_data_base.name_table, "people");
  assert.equal(receivedChunks[0][1].object_data.fields.number, sharedNumber);
  assert.equal(receivedChunks[1].at(-1).object_data.fields.number, sharedNumber);
  assert.deepEqual(meta, {
    totalResults: 321,
    matchedDocuments: totalMatches,
    matchedSources: 1,
  });

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase still supports legacy embedded lookup entries", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-legacy-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.getIndexFieldDir("number"), { recursive: true });
  await fs.mkdir(paths.documentLookupDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });

  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      importedAt: "2026-07-20T10:00:00.000Z",
      name: "Р›СЋРґРё",
      description: "РўРµСЃС‚РѕРІР°СЏ Р»РѕРєР°Р»СЊРЅР°СЏ Р±Р°Р·Р°",
      type: "РљРѕРЅС‚Р°РєС‚С‹",
    },
  ]);
  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", "79"),
    [JSON.stringify({ term: "79991234567", docId: "people:1" })]
  );
  await jsonLinesRepository.appendLines(paths.getDocumentLookupBucketPath("pe"), [
    JSON.stringify({
      docId: "people:1",
      sourceTable: "people",
      rowId: 1,
      fields: { number: "79991234567", fio: "РР’РђРќРћР’ РР’РђРќ" },
      invalidFields: {},
    }),
  ]);

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
  assert.equal(results[1].object_data.fields.number, "79991234567");

  await fs.rm(tempRoot, { recursive: true, force: true });
});
