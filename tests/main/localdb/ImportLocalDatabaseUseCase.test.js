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
  assert.equal(documentFiles.length, 1);
  assert.ok(progressEvents.some((event) => event.stage === "started"));
  assert.ok(progressEvents.some((event) => event.stage === "progress"));
  assert.ok(progressEvents.some((event) => event.stage === "file-completed"));
  assert.ok(progressEvents.some((event) => event.stage === "completed"));

  await fs.rm(tempRoot, { recursive: true, force: true });
});
