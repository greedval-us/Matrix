import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { LocalDatabaseMigrationService } from "../../../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabasePaths } from "../../../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../../../src/main/localdb/LocalDatabaseStateRepository.js";
import { LOCAL_DATABASE_FORMAT, LOCAL_DATABASE_VERSION } from "../../../src/main/localdb/constants.js";

test("LocalDatabaseMigrationService upgrades old metadata to current version", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-migration-"));
  const metaDir = path.join(tempRoot, "meta");
  await fs.mkdir(metaDir, { recursive: true });

  const oldMeta = {
    format: "matrix-local-db",
    version: 1,
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    storage: {
      status: "imported",
    },
    indexes: {},
  };

  const paths = new LocalDatabasePaths(tempRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeJson(paths.databaseMetaPath, oldMeta);

  const migrationService = new LocalDatabaseMigrationService({ stateRepository });
  const result = await migrationService.migrate(paths);
  const migratedMeta = await stateRepository.readJson(paths.databaseMetaPath);

  assert.equal(result.migrated, true);
  assert.equal(result.fromVersion, 1);
  assert.equal(result.toVersion, LOCAL_DATABASE_VERSION);
  assert.equal(migratedMeta.format, LOCAL_DATABASE_FORMAT);
  assert.equal(migratedMeta.version, LOCAL_DATABASE_VERSION);
  assert.equal(migratedMeta.storage.engine, "rocksdb");
  assert.ok(Array.isArray(migratedMeta.indexes.fields));
  assert.ok(typeof migratedMeta.indexes.bucketLayoutVersion === "number");
  assert.ok(typeof migratedMeta.indexes.bucketLayouts.number === "number");

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("LocalDatabaseMigrationService preserves existing bucket layouts", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-migration-layouts-"));
  const metaDir = path.join(tempRoot, "meta");
  await fs.mkdir(metaDir, { recursive: true });

  const oldMeta = {
    format: "matrix-local-db",
    version: 1,
    createdAt: "2026-07-19T10:00:00.000Z",
    updatedAt: "2026-07-19T10:00:00.000Z",
    storage: {
      engine: "rocksdb",
      status: "imported",
    },
    indexes: {
      version: 1,
      lookupFormatVersion: 5,
      bucketLayoutVersion: 2,
      bucketLayouts: {
        number: 2,
        mail: 2,
        fio: 1,
      },
    },
  };

  const paths = new LocalDatabasePaths(tempRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  await stateRepository.writeJson(paths.databaseMetaPath, oldMeta);

  const migrationService = new LocalDatabaseMigrationService({ stateRepository });
  await migrationService.migrate(paths);
  const migratedMeta = await stateRepository.readJson(paths.databaseMetaPath);

  assert.equal(migratedMeta.indexes.lookupFormatVersion, 5);
  assert.equal(migratedMeta.indexes.bucketLayoutVersion, 2);
  assert.equal(migratedMeta.indexes.bucketLayouts.number, 2);
  assert.equal(migratedMeta.indexes.bucketLayouts.mail, 2);
  assert.equal(migratedMeta.indexes.bucketLayouts.fio, 1);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
