import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ImportLocalDatabaseUseCase } from "../../../src/main/application/localdb/ImportLocalDatabaseUseCase.js";
import { ImportedDocumentFactory } from "../../../src/main/localdb/ImportedDocumentFactory.js";
import { ImportFileReader } from "../../../src/main/localdb/ImportFileReader.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabaseGuard } from "../../../src/main/localdb/LocalDatabaseGuard.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { OperationCoordinator } from "../../../src/main/localdb/OperationCoordinator.js";

test("ImportLocalDatabaseUseCase imports records and updates metadata", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-import-"));
  const dbRoot = path.join(tempRoot, "db");
  const importRoot = path.join(tempRoot, "input");
  const paths = new LocalDatabasePaths(dbRoot);

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await fs.mkdir(importRoot, { recursive: true });

  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T09:00:00.000Z")
  );

  await fs.writeFile(
    path.join(importRoot, "people.json"),
    JSON.stringify([
      { id: 1, surname: "Иванов", name: "Иван", number: "+79991234567" },
      { id: 2, surname: "Петров", name: "Петр", mail: "test@example.com" },
    ]),
    "utf8"
  );

  const fakeLocalDatabaseService = {
    getStoredRootPath() {
      return dbRoot;
    },
    async ensureReady(rootPath) {
      return { initialized: true, rootPath };
    },
  };

  const progressEvents = [];
  const useCase = new ImportLocalDatabaseUseCase({
    localDatabaseService: fakeLocalDatabaseService,
    guard: new LocalDatabaseGuard(),
    stateRepository,
    jsonLinesRepository: new JsonLinesRepository(),
    operationCoordinator: new OperationCoordinator(),
    documentFactory: new ImportedDocumentFactory(),
    importFileReader: new ImportFileReader(),
  });

  const summary = await useCase.execute(importRoot, {
    onProgress: (event) => progressEvents.push(event),
  });
  const importState = await stateRepository.readImportState(paths);
  const sources = await stateRepository.readSources(paths);
  const documentFiles = await fs.readdir(paths.documentsDir);

  assert.equal(summary.status, "completed");
  assert.equal(summary.documentsImported, 2);
  assert.equal(summary.documentsTotal, 2);
  assert.equal(importState.status, "completed");
  assert.equal(sources.length, 1);
  assert.equal(sources[0].name, "people");
  assert.equal(sources[0].description, "Imported from file people.json");
  assert.equal(sources[0].type, "local-import");
  assert.equal(documentFiles.length, 1);
  assert.ok(progressEvents.some((event) => event.stage === "started"));
  assert.ok(progressEvents.some((event) => event.stage === "progress"));
  assert.ok(progressEvents.some((event) => event.stage === "file-completed"));
  assert.ok(progressEvents.some((event) => event.stage === "completed"));

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("ImportLocalDatabaseUseCase applies custom metadata and avoids source table collisions", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-import-safe-"));
  const dbRoot = path.join(tempRoot, "db");
  const importRoot = path.join(tempRoot, "input");
  const paths = new LocalDatabasePaths(dbRoot);

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await fs.mkdir(importRoot, { recursive: true });

  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T09:00:00.000Z")
  );
  await stateRepository.writeJson(paths.sourcesMetaPath, [
    {
      sourceTable: "people",
      fileName: "people.json",
      name: "Existing People",
      description: "Existing description",
      type: "existing-type",
      documentsImported: 10,
      importedAt: "2026-07-19T09:00:00.000Z",
    },
  ]);

  await fs.writeFile(
    path.join(importRoot, "people.json"),
    JSON.stringify([{ id: 1, name: "Ivan", number: "+79991234567" }]),
    "utf8"
  );

  const useCase = new ImportLocalDatabaseUseCase({
    localDatabaseService: {
      getStoredRootPath() {
        return dbRoot;
      },
      async ensureReady(rootPath) {
        return { initialized: true, rootPath };
      },
    },
    guard: new LocalDatabaseGuard(),
    stateRepository,
    jsonLinesRepository: new JsonLinesRepository(),
    operationCoordinator: new OperationCoordinator(),
    documentFactory: new ImportedDocumentFactory(),
    importFileReader: new ImportFileReader(),
  });

  const summary = await useCase.execute(importRoot, {
    defaultName: "Новая база",
    defaultDescription: "User supplied description",
    defaultType: "Контакты",
  });

  const sources = await stateRepository.readSources(paths);
  const newSource = sources.find((source) => source.sourceTable !== "people");

  assert.equal(summary.status, "completed");
  assert.equal(newSource.sourceTable, "people_2");
  assert.equal(newSource.name, "Новая база");
  assert.equal(newSource.description, "User supplied description");
  assert.equal(newSource.type, "Контакты");
  assert.equal(
    sources.find((source) => source.sourceTable === "people").description,
    "Existing description"
  );

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("ImportLocalDatabaseUseCase splits imported documents into size-limited segments", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-import-segments-"));
  const dbRoot = path.join(tempRoot, "db");
  const importRoot = path.join(tempRoot, "input");
  const paths = new LocalDatabasePaths(dbRoot);

  await fs.mkdir(paths.documentsDir, { recursive: true });
  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await fs.mkdir(importRoot, { recursive: true });

  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-07-20T09:00:00.000Z")
  );

  await fs.writeFile(
    path.join(importRoot, "people.json"),
    JSON.stringify(
      Array.from({ length: 6 }, (_value, index) => ({
        id: index + 1,
        surname: `Person ${index + 1}`,
        name: "Segment Test",
        number: `7999000000${index}`,
        note: "x".repeat(220),
      }))
    ),
    "utf8"
  );

  const useCase = new ImportLocalDatabaseUseCase({
    localDatabaseService: {
      getStoredRootPath() {
        return dbRoot;
      },
      async ensureReady(rootPath) {
        return { initialized: true, rootPath };
      },
    },
    guard: new LocalDatabaseGuard(),
    stateRepository,
    jsonLinesRepository: new JsonLinesRepository(),
    operationCoordinator: new OperationCoordinator(),
    documentFactory: new ImportedDocumentFactory(),
    importFileReader: new ImportFileReader(),
  });

  const summary = await useCase.execute(importRoot, {
    maxDocumentSegmentSizeBytes: 300,
  });

  const documentFiles = (await fs.readdir(paths.documentsDir)).sort();

  assert.equal(summary.status, "completed");
  assert.ok(documentFiles.length > 1);
  assert.equal(summary.outputPaths.length, documentFiles.length);
  assert.ok(documentFiles.every((fileName) => /^import_.*_part_\d{4}\.jsonl$/u.test(fileName)));

  let importedDocuments = 0;
  for (const fileName of documentFiles) {
    const filePath = path.join(paths.documentsDir, fileName);
    const fileContent = await fs.readFile(filePath, "utf8");
    importedDocuments += fileContent
      .split("\n")
      .filter(Boolean)
      .length;
  }

  assert.equal(importedDocuments, 6);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
