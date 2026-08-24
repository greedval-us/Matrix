import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { IndexService } from "../../../src/main/services/IndexService.js";
import { JsonLinesRepository } from "../../../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";

test("IndexService recovers stale running index state after interruption", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-service-recover-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-18T09:00:00.000Z")
  );
  await stateRepository.writeIndexState(paths, {
    status: "running",
    buildMode: "full",
    buildReason: "initial-build",
    indexedAt: "2026-08-18T08:00:00.000Z",
    startedAt: "2026-08-18T08:00:00.000Z",
    filesProcessed: 12,
    filesTotal: 100,
    indexedDocuments: 12345,
    documentsTotal: 12345,
    indexedEntries: 56789,
    lookupEntries: 12345,
    currentFile: "import_people.jsonl",
    session: {
      resumable: true,
      buildId: "test-build",
      stagedOnly: false,
      workingIndexesDir: paths.getTempPath("index-build-test-build"),
      backupIndexesDir: paths.getTempPath("index-backup-test-build"),
      completedFiles: ["import_a.jsonl"],
      pendingFiles: ["import_people.jsonl"],
    },
  });

  const staleTime = new Date(Date.now() - 5 * 60 * 1000);
  await fs.utimes(paths.indexStatePath, staleTime, staleTime);

  const service = Object.create(IndexService.prototype);
  service.localDatabaseService = {
    getStoredRootPath() {
      return dbRoot;
    },
  };
  service.stateRepository = stateRepository;
  service.jsonLinesRepository = jsonLinesRepository;
  service.useCase = { currentBuildToken: null };

  const recovered = await service.getLastIndexStatus();

  assert.equal(recovered.status, "cancelled");
  assert.equal(recovered.filesProcessed, 12);
  assert.equal(recovered.session.resumable, true);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("IndexService keeps fresh running index state untouched", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-index-service-fresh-"));
  const dbRoot = path.join(tempRoot, "db");
  const paths = new LocalDatabasePaths(dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();

  await fs.mkdir(paths.metaDir, { recursive: true });
  await fs.mkdir(paths.stateDir, { recursive: true });
  await fs.mkdir(paths.tempDir, { recursive: true });
  await stateRepository.writeJson(
    paths.databaseMetaPath,
    stateRepository.buildDatabaseMeta("2026-08-18T09:00:00.000Z")
  );
  await stateRepository.writeIndexState(paths, {
    status: "running",
    buildMode: "full",
    filesProcessed: 1,
    filesTotal: 10,
    indexedDocuments: 100,
    session: {
      resumable: true,
      buildId: "fresh-build",
      stagedOnly: false,
      workingIndexesDir: paths.getTempPath("index-build-fresh-build"),
      backupIndexesDir: paths.getTempPath("index-backup-fresh-build"),
      completedFiles: [],
      pendingFiles: ["import_people.jsonl"],
    },
  });

  const service = Object.create(IndexService.prototype);
  service.localDatabaseService = {
    getStoredRootPath() {
      return dbRoot;
    },
  };
  service.stateRepository = stateRepository;
  service.jsonLinesRepository = jsonLinesRepository;
  service.useCase = { currentBuildToken: null };

  const recovered = await service.getLastIndexStatus();

  assert.equal(recovered.status, "running");
  assert.equal(recovered.filesProcessed, 1);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
