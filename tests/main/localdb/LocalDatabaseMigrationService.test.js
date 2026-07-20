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

  await fs.rm(tempRoot, { recursive: true, force: true });
});
