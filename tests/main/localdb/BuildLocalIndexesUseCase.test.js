import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { BuildLocalIndexesUseCase } from "../../../src/main/application/localdb/BuildLocalIndexesUseCase.js";
import { LocalIndexBuildPlanner } from "../../../src/main/application/localdb/LocalIndexBuildPlanner.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { OperationCoordinator } from "../../../src/main/localdb/OperationCoordinator.js";
import { SearchTermService } from "../../../src/main/localdb/SearchTermService.js";
import { DOCUMENT_LOOKUP_FORMAT_VERSION } from "../../../src/main/localdb/constants.js";

function createUseCase({ dbRoot, stateRepository, jsonLinesRepository }) {
  const fakeLocalDatabaseService = {
    getStoredRootPath() {
      return dbRoot;
    },
    async ensureReady(rootPath) {
      return { initialized: true, rootPath };
    },
  };

  return new BuildLocalIndexesUseCase({
    localDatabaseService: fakeLocalDatabaseService,
    stateRepository,
    jsonLinesRepository,
    operationCoordinator: new OperationCoordinator(),
    termService: new SearchTermService(),
    indexBuildPlanner: new LocalIndexBuildPlanner({
      jsonLinesRepository,
    }),
  });
}

test("BuildLocalIndexesUseCase builds indexes and emits progress", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const progressEvents = [];

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T10:00:00.000Z")
  );
  await jsonLinesRepository.appendLines(
    path.join(paths.documentsDir, "import_test.jsonl"),
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

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });

  const summary = await useCase.execute({
    onProgress: (event) => progressEvents.push(event),
  });

  assert.equal(summary.status, "completed");
  assert.equal(summary.buildMode, "full");
  assert.ok(progressEvents.some((event) => event.stage === "started"));
  assert.ok(progressEvents.some((event) => event.stage === "progress"));
  assert.ok(progressEvents.some((event) => event.stage === "file-completed"));
  assert.ok(progressEvents.some((event) => event.stage === "completed"));
  assert.equal(await jsonLinesRepository.exists(paths.getIndexBucketPath("number", "79")), true);
  assert.equal(summary.lookupFormatVersion, DOCUMENT_LOOKUP_FORMAT_VERSION);

  const lookupEntries = [];
  for await (const entry of jsonLinesRepository.iterateJson(paths.getDocumentLookupBucketPath("pe"))) {
    lookupEntries.push(entry);
  }

  assert.deepEqual(Object.keys(lookupEntries[0]).sort(), [
    "byteLength",
    "byteOffset",
    "docId",
    "fileName",
  ]);
  assert.equal(lookupEntries[0].fileName, "import_test.jsonl");
  const storedLine = await jsonLinesRepository.readChunk(
    paths.getDocumentPath(lookupEntries[0].fileName),
    lookupEntries[0].byteOffset,
    lookupEntries[0].byteLength
  );
  const storedDocument = JSON.parse(storedLine);
  assert.equal(storedDocument.docId, "people:1");
  assert.equal(storedDocument.sourceTable, "people");
  assert.equal(storedDocument.rowId, 1);
  assert.equal(storedDocument.fields.number, "79991234567");
  assert.deepEqual(storedDocument.invalidFields, {});

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase indexes valid numbers extracted from no_valid_number", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-invalid-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-23T10:00:00.000Z")
  );
  await jsonLinesRepository.appendLines(
    path.join(paths.documentsDir, "import_invalid_numbers.jsonl"),
    [
      JSON.stringify({
        docId: "numbers:1",
        sourceTable: "numbers",
        rowId: 1,
        fields: {},
        invalidFields: {
          no_valid_number: "79274279737 8434125131 79274279747",
        },
      }),
    ]
  );

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });

  await useCase.execute();

  const bucketPath = paths.getIndexBucketPath("number", "79");
  const indexedEntries = [];
  for await (const entry of jsonLinesRepository.iterateJson(bucketPath)) {
    indexedEntries.push(entry);
  }

  assert.ok(indexedEntries.some((entry) => entry.term === "79274279737"));
  assert.ok(indexedEntries.some((entry) => entry.term === "79274279747"));

  const secondBucketPath = paths.getIndexBucketPath("number", "84");
  const secondBucketEntries = [];
  for await (const entry of jsonLinesRepository.iterateJson(secondBucketPath)) {
    secondBucketEntries.push(entry);
  }

  assert.ok(secondBucketEntries.some((entry) => entry.term === "8434125131"));

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase incrementally indexes only new document files", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-incremental-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-27T10:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(
    path.join(paths.documentsDir, "import_people.jsonl"),
    [
      JSON.stringify({
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: { number: "79991234567" },
        invalidFields: {},
      }),
    ]
  );

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  const firstSummary = await useCase.execute();
  assert.equal(firstSummary.buildMode, "full");

  await jsonLinesRepository.appendLines(
    path.join(paths.documentsDir, "import_clients.jsonl"),
    [
      JSON.stringify({
        docId: "clients:1",
        sourceTable: "clients",
        rowId: 1,
        fields: { number: "78889990000" },
        invalidFields: {},
      }),
    ]
  );

  const secondSummary = await useCase.execute();
  assert.equal(secondSummary.buildMode, "incremental");
  assert.equal(secondSummary.filesTotal, 1);
  assert.equal(secondSummary.reusedFiles, 1);
  assert.equal(secondSummary.indexedDocuments, 1);

  const bucket79 = [];
  for await (const entry of jsonLinesRepository.iterateJson(paths.getIndexBucketPath("number", "79"))) {
    bucket79.push(entry);
  }
  assert.ok(bucket79.some((entry) => entry.docId === "people:1"));

  const bucket78 = [];
  for await (const entry of jsonLinesRepository.iterateJson(paths.getIndexBucketPath("number", "78"))) {
    bucket78.push(entry);
  }
  assert.ok(bucket78.some((entry) => entry.docId === "clients:1"));

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase publishes incremental indexes after each processed file", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-incremental-publish-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-03T10:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_base.jsonl"), [
    JSON.stringify({
      docId: "base:1",
      sourceTable: "base",
      rowId: 1,
      fields: { number: "79990000001" },
      invalidFields: {},
    }),
  ]);

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  await useCase.execute();

  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_alpha.jsonl"), [
    JSON.stringify({
      docId: "alpha:1",
      sourceTable: "alpha",
      rowId: 1,
      fields: { number: "71110000001" },
      invalidFields: {},
    }),
  ]);
  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_beta.jsonl"), [
    JSON.stringify({
      docId: "beta:1",
      sourceTable: "beta",
      rowId: 1,
      fields: { number: "72220000001" },
      invalidFields: {},
    }),
  ]);

  let completedSeen = false;
  let publishedBeforeCompleted = false;
  const checks = [];

  const summary = await useCase.execute({
    onProgress: (event) => {
      if (event.stage === "completed") {
        completedSeen = true;
        return;
      }

      if (event.stage === "file-completed" && event.currentFile === "import_alpha.jsonl") {
        publishedBeforeCompleted = !completedSeen;
        checks.push(
          (async () => {
            const bucket71 = [];
            for await (const entry of jsonLinesRepository.iterateJson(
              paths.getIndexBucketPath("number", "71")
            )) {
              bucket71.push(entry);
            }

            assert.ok(bucket71.some((entry) => entry.docId === "alpha:1"));
          })()
        );
      }
    },
  });

  await Promise.all(checks);

  assert.equal(summary.buildMode, "incremental");
  assert.equal(publishedBeforeCompleted, true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase publishes full rebuild indexes after each file when starting from empty indexes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-full-publish-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-03T11:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_alpha.jsonl"), [
    JSON.stringify({
      docId: "alpha:1",
      sourceTable: "alpha",
      rowId: 1,
      fields: { number: "71110000001" },
      invalidFields: {},
    }),
  ]);
  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_beta.jsonl"), [
    JSON.stringify({
      docId: "beta:1",
      sourceTable: "beta",
      rowId: 1,
      fields: { number: "72220000001" },
      invalidFields: {},
    }),
  ]);

  let completedSeen = false;
  let publishedBeforeCompleted = false;
  const checks = [];
  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });

  const summary = await useCase.execute({
    onProgress: (event) => {
      if (event.stage === "completed") {
        completedSeen = true;
        return;
      }

      if (event.stage === "file-completed" && event.currentFile === "import_alpha.jsonl") {
        publishedBeforeCompleted = !completedSeen;
        checks.push(
          (async () => {
            const bucket71 = [];
            for await (const entry of jsonLinesRepository.iterateJson(
              paths.getIndexBucketPath("number", "71")
            )) {
              bucket71.push(entry);
            }

            assert.ok(bucket71.some((entry) => entry.docId === "alpha:1"));
          })()
        );
      }
    },
  });

  await Promise.all(checks);

  assert.equal(summary.buildMode, "full");
  assert.equal(publishedBeforeCompleted, true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase treats an empty indexes directory as missing published indexes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-empty-dir-publish-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await fs.mkdir(paths.indexesDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-03T12:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_alpha.jsonl"), [
    JSON.stringify({
      docId: "alpha:1",
      sourceTable: "alpha",
      rowId: 1,
      fields: { number: "71110000001" },
      invalidFields: {},
    }),
  ]);
  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_beta.jsonl"), [
    JSON.stringify({
      docId: "beta:1",
      sourceTable: "beta",
      rowId: 1,
      fields: { number: "72220000001" },
      invalidFields: {},
    }),
  ]);

  let completedSeen = false;
  let publishedBeforeCompleted = false;
  const checks = [];
  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });

  const summary = await useCase.execute({
    onProgress: (event) => {
      if (event.stage === "completed") {
        completedSeen = true;
        return;
      }

      if (event.stage === "file-completed" && event.currentFile === "import_alpha.jsonl") {
        publishedBeforeCompleted = !completedSeen;
        checks.push(
          (async () => {
            const bucket71 = [];
            for await (const entry of jsonLinesRepository.iterateJson(
              paths.getIndexBucketPath("number", "71")
            )) {
              bucket71.push(entry);
            }

            assert.ok(bucket71.some((entry) => entry.docId === "alpha:1"));
          })()
        );
      }
    },
  });

  await Promise.all(checks);

  assert.equal(summary.buildMode, "full");
  assert.equal(publishedBeforeCompleted, true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase keeps previous statistics when rebuild is noop", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-noop-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-28T10:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(
    path.join(paths.documentsDir, "import_people.jsonl"),
    [
      JSON.stringify({
        docId: "people:1",
        sourceTable: "people",
        rowId: 1,
        fields: { number: "79991234567" },
        invalidFields: {},
      }),
    ]
  );

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  const firstSummary = await useCase.execute();
  const secondSummary = await useCase.execute();

  assert.equal(firstSummary.status, "completed");
  assert.equal(secondSummary.buildMode, "noop");
  assert.equal(secondSummary.indexedDocuments, firstSummary.indexedDocuments);
  assert.equal(secondSummary.documentsTotal, firstSummary.documentsTotal);
  assert.equal(secondSummary.indexedEntries, firstSummary.indexedEntries);
  assert.equal(secondSummary.lookupEntries, firstSummary.lookupEntries);
  assert.deepEqual(secondSummary.fields, firstSummary.fields);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase falls back to full rebuild when an indexed file changes", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-rebuild-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-27T11:00:00.000Z")
  );

  const sourceFile = path.join(paths.documentsDir, "import_people.jsonl");
  await jsonLinesRepository.appendLines(sourceFile, [
    JSON.stringify({
      docId: "people:1",
      sourceTable: "people",
      rowId: 1,
      fields: { number: "79991234567" },
      invalidFields: {},
    }),
  ]);

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  await useCase.execute();

  await new Promise((resolve) => setTimeout(resolve, 20));
  await jsonLinesRepository.appendLines(sourceFile, [
    JSON.stringify({
      docId: "people:2",
      sourceTable: "people",
      rowId: 2,
      fields: { number: "79991230000" },
      invalidFields: {},
    }),
  ]);

  const rebuiltSummary = await useCase.execute();
  assert.equal(rebuiltSummary.buildMode, "full");
  assert.equal(rebuiltSummary.filesTotal, 1);
  assert.equal(rebuiltSummary.indexedDocuments, 2);

  const bucket79 = [];
  for await (const entry of jsonLinesRepository.iterateJson(paths.getIndexBucketPath("number", "79"))) {
    bucket79.push(entry);
  }

  assert.equal(bucket79.filter((entry) => entry.docId === "people:1").length, 1);
  assert.equal(bucket79.filter((entry) => entry.docId === "people:2").length, 1);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase can cancel and resume unfinished indexing", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-resume-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-27T12:00:00.000Z")
  );

  const sourceFile = path.join(paths.documentsDir, "import_big.jsonl");
  const records = [];
  for (let index = 0; index < 5200; index += 1) {
    records.push(
      JSON.stringify({
        docId: `people:${index + 1}`,
        sourceTable: "people",
        rowId: index + 1,
        fields: { number: `7999${String(index).padStart(7, "0")}` },
        invalidFields: {},
      })
    );
  }
  await jsonLinesRepository.appendLines(sourceFile, records);

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  const originalIterateJsonWithMetadata =
    jsonLinesRepository.iterateJsonWithMetadata.bind(jsonLinesRepository);
  let seenDocuments = 0;
  jsonLinesRepository.iterateJsonWithMetadata = async function* (...args) {
    for await (const entry of originalIterateJsonWithMetadata(...args)) {
      seenDocuments += 1;
      if (seenDocuments === 100) {
        useCase.cancel("manual-stop");
      }
      yield entry;
    }
  };

  const cancelledSummary = await useCase.execute();

  assert.equal(cancelledSummary.status, "cancelled");
  assert.equal(cancelledSummary.filesProcessed, 0);
  assert.equal(cancelledSummary.session.pendingFiles.length, 1);
  assert.equal(cancelledSummary.lookupFormatVersion, DOCUMENT_LOOKUP_FORMAT_VERSION);

  const resumedSummary = await useCase.execute();
  assert.equal(resumedSummary.status, "completed");
  assert.equal(resumedSummary.indexedDocuments, 5200);

  const bucketPath = paths.getIndexBucketPath("number", "79");
  const indexedEntries = [];
  for await (const entry of jsonLinesRepository.iterateJson(bucketPath)) {
    indexedEntries.push(entry);
  }

  assert.equal(indexedEntries.length, 5200);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("BuildLocalIndexesUseCase restarts from scratch when cancelled session uses old lookup format", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-legacy-resume-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-28T10:00:00.000Z")
  );

  await jsonLinesRepository.appendLines(path.join(paths.documentsDir, "import_people.jsonl"), [
    JSON.stringify({
      docId: "people:1",
      sourceTable: "people",
      rowId: 1,
      fields: { number: "79991234567" },
      invalidFields: {},
    }),
  ]);

  const legacyWorkingDir = paths.getTempPath("index-build-legacy");
  const legacyBackupDir = paths.getTempPath("index-backup-legacy");
  await fs.mkdir(legacyWorkingDir, { recursive: true });

  await stateRepository.writeIndexState(paths, {
    status: "cancelled",
    buildMode: "full",
    indexedAt: "2026-07-28T10:00:00.000Z",
    startedAt: "2026-07-28T10:00:00.000Z",
    filesTotal: 1,
    filesProcessed: 0,
    indexedDocuments: 0,
    documentsTotal: 0,
    indexedEntries: 0,
    lookupEntries: 0,
    lookupFormatVersion: 1,
    fileManifest: {
      "import_people.jsonl": {
        size: 0,
        modifiedAtMs: 0,
        documentsTotal: 0,
      },
    },
    fields: { number: 0, mail: 0, fio: 0, passport: 0, inn: 0, snils: 0, telegram: 0, vk: 0, facebook: 0, grz: 0, vin: 0, date_of_birth: 0 },
    session: {
      resumable: true,
      buildId: "legacy",
      workingIndexesDir: legacyWorkingDir,
      backupIndexesDir: legacyBackupDir,
      completedFiles: [],
      pendingFiles: ["import_people.jsonl"],
    },
  });

  const useCase = createUseCase({ dbRoot, stateRepository, jsonLinesRepository });
  const summary = await useCase.execute();

  assert.equal(summary.status, "completed");
  assert.equal(summary.buildReason, "initial-build");
  assert.equal(summary.lookupFormatVersion, DOCUMENT_LOOKUP_FORMAT_VERSION);
  assert.equal(await jsonLinesRepository.exists(legacyWorkingDir), false);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
