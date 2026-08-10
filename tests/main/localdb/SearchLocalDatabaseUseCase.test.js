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
import { getLatestBucketLayoutVersion } from "../../../src/main/localdb/indexBucketLayouts.js";

function getFieldBucketName(field, term) {
  return new SearchTermService().getIndexBucketName(
    field,
    term,
    getLatestBucketLayoutVersion(field)
  );
}

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
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T10:00:00.000Z")
  );

  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      importedAt: "2026-07-20T10:00:00.000Z",
      name: "Люди",
      description: "Тестовая локальная база",
      type: "Контакты",
    },
  ]);

  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", getFieldBucketName("number", sharedNumber)),
    indexEntries
  );
  await jsonLinesRepository.appendLines(
    paths.getDocumentPath(fileName),
    compactLookupEntries.map(({ line }) => line)
  );

  const lookupBuckets = new Map();
  for (const { entry } of compactLookupEntries) {
    const bucketName = termService.getDocumentBucketName(entry.docId);
    const bucketEntries = lookupBuckets.get(bucketName) || [];
    bucketEntries.push(JSON.stringify(entry));
    lookupBuckets.set(bucketName, bucketEntries);
  }

  for (const [bucketName, bucketEntries] of lookupBuckets.entries()) {
    await jsonLinesRepository.appendLines(
      paths.getDocumentLookupBucketPath(bucketName),
      bucketEntries
    );
  }
}

test("SearchLocalDatabaseUseCase returns matching local source and records", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const sharedNumber = "79991234567";

  await fs.mkdir(paths.stateDir, { recursive: true });

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
        fields: { number: sharedNumber, fio: "ИВАНОВ ИВАН" },
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
  assert.equal(results[0].object_data_base.name, "Люди");
  assert.equal(results[0].object_data_base.info, "Тестовая локальная база");
  assert.equal(results[0].object_data_base.type, "Контакты");
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
        fio: `ИВАНОВ ИВАН ${index + 1}`,
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
        fio: `ИВАНОВ ИВАН ${index + 1}`,
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
  const termService = new SearchTermService();

  await fs.mkdir(paths.getIndexFieldDir("number"), { recursive: true });
  await fs.mkdir(paths.documentLookupDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T10:00:00.000Z")
  );

  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      importedAt: "2026-07-20T10:00:00.000Z",
      name: "Люди",
      description: "Тестовая локальная база",
      type: "Контакты",
    },
  ]);
  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", getFieldBucketName("number", "79991234567")),
    [
    JSON.stringify({ term: "79991234567", docId: "people:1" }),
    ]
  );
  await jsonLinesRepository.appendLines(
    paths.getDocumentLookupBucketPath(termService.getDocumentBucketName("people:1")),
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
    termService,
  });

  const results = await useCase.execute({ number: "+7 (999) 123-45-67" });

  assert.equal(results.length, 2);
  assert.equal(results[1].object_data.fields.number, "79991234567");

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase prioritizes the narrowest indexed bucket first", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-order-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const profile = {};

  await seedCompactLookup({
    paths,
    stateRepository,
    jsonLinesRepository,
    termService,
    fileName: "import_people.jsonl",
    sharedNumber: "79991234567",
    records: [
      {
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: {
          number: "79991234567",
          mail: "test@example.com",
        },
        invalidFields: {},
      },
    ],
  });

  await fs.mkdir(paths.getIndexFieldDir("mail"), { recursive: true });
  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("mail", getFieldBucketName("mail", "test@example.com")),
    [
      JSON.stringify({
        term: "test@example.com",
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
      }),
    ]
  );
  await stateRepository.writeIndexBucketStats(paths, {
    builtAt: "2026-08-10T09:00:00.000Z",
    fields: {
      number: { [getFieldBucketName("number", "79991234567")]: 500000 },
      mail: { [getFieldBucketName("mail", "test@example.com")]: 1 },
    },
    documentLookup: {},
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

  const results = await useCase.execute(
    { number: "+7 (999) 123-45-67", mail: "test@example.com" },
    { profile }
  );

  assert.equal(results.length, 2);
  assert.equal(profile.queryFields[0].field, "mail");
  assert.equal(profile.queryFields[1].field, "number");

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase uses running index state bucket layouts during active rebuild", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-running-state-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();
  const sharedNumber = "79991234567";
  await fs.mkdir(paths.stateDir, { recursive: true });

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
        fields: { number: sharedNumber, fio: "ИВАНОВ ИВАН" },
        invalidFields: {},
      },
    ],
  });

  await stateRepository.writeJson(paths.databaseMetaPath, {
    ...(await stateRepository.readJson(paths.databaseMetaPath, {})),
    indexes: {
      version: 1,
      fields: ["number", "mail", "fio"],
      lookupFormatVersion: 1,
      bucketLayoutVersion: 1,
      bucketLayouts: {
        number: 1,
        mail: 1,
        fio: 1,
      },
    },
  });

  await stateRepository.writeIndexState(paths, {
    status: "running",
    lookupFormatVersion: 5,
    bucketLayoutVersion: 4,
    bucketLayouts: {
      number: 3,
      mail: 3,
      fio: 4,
      passport: 3,
      inn: 3,
      snils: 3,
      telegram: 3,
      vk: 3,
      facebook: 3,
      grz: 2,
      vin: 2,
      date_of_birth: 3,
    },
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
  assert.equal(results[1].object_data.fields.number, sharedNumber);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase resolves wildcard lookups across hashed number buckets", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-wildcard-hash-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();

  await fs.mkdir(paths.stateDir, { recursive: true });

  await seedCompactLookup({
    paths,
    stateRepository,
    jsonLinesRepository,
    termService,
    fileName: "import_people.jsonl",
    sharedNumber: "79991234567",
    records: [
      {
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: { number: "79991234567", fio: "ИВАНОВ ИВАН" },
        invalidFields: {},
      },
      {
        docId: "people:2",
        sourceTable: "people",
        rowId: 2,
        fields: { number: "79991230000", fio: "ПЕТРОВ ПЕТР" },
        invalidFields: {},
      },
    ],
  });

  await jsonLinesRepository.appendLines(
    paths.getIndexBucketPath("number", getFieldBucketName("number", "79991230000")),
    [
      JSON.stringify({
        term: "79991230000",
        docId: "people:2",
        sourceTable: "people",
        rowId: 2,
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
    termService,
  });

  const results = await useCase.execute({ number: "7999%" });
  const recordResults = results.filter((item) => item.object_data);

  assert.equal(recordResults.length, 2);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("SearchLocalDatabaseUseCase resolves wildcard lookups across hashed fio buckets", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-search-fio-wildcard-hash-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const termService = new SearchTermService();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.getIndexFieldDir("fio"), { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-10T12:00:00.000Z")
  );
  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      importedAt: "2026-08-10T12:00:00.000Z",
      name: "Люди",
      description: "Тестовая локальная база",
      type: "Контакты",
    },
  ]);

  const records = [
    {
      docId: "people:1",
      sourceTable: "people",
      rowId: 1,
      fields: { fio: "АЛЕКСЕЕВ АЛЕКСЕЙ" },
      invalidFields: {},
    },
    {
      docId: "people:2",
      sourceTable: "people",
      rowId: 2,
      fields: { fio: "АЛЕКСАНДРОВ АЛЕКСАНДР" },
      invalidFields: {},
    },
  ];

  const compactLookupEntries = buildCompactLookupEntries("import_people.jsonl", records);
  await jsonLinesRepository.appendLines(
    paths.getDocumentPath("import_people.jsonl"),
    compactLookupEntries.map(({ line }) => line)
  );

  for (const record of records) {
    await jsonLinesRepository.appendLines(
      paths.getIndexBucketPath("fio", getFieldBucketName("fio", record.fields.fio)),
      [
        JSON.stringify({
          term: termService.normalizeIndexTerm("fio", record.fields.fio),
          docId: record.docId,
          sourceTable: record.sourceTable,
          rowId: record.rowId,
        }),
      ]
    );
  }

  for (const { entry } of compactLookupEntries) {
    await jsonLinesRepository.appendLines(
      paths.getDocumentLookupBucketPath(termService.getDocumentBucketName(entry.docId)),
      [JSON.stringify(entry)]
    );
  }

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

  const results = await useCase.execute({ fio: "АЛЕКС%" });
  const recordResults = results.filter((item) => item.object_data);

  assert.equal(recordResults.length, 2);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
