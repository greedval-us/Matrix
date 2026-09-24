import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { INDEXABLE_FIELDS, SQLITE_INDEX_FORMAT_VERSION, SQLITE_TERM_SHARD_COUNT, SQLITE_DOCUMENT_SHARD_COUNT } from "../localdb/constants.js";
import { FIELD_STORAGE_MODE } from "./LsmSqliteIndexStore.js";
import { SqliteIndexStore } from "./SqliteIndexStore.js";

const MIGRATION_VERSION = 2;

function sourceDirectories(paths, state) {
  return [
    ...(state.storage.segments || []).toReversed().map((segment) => ({
      id: segment.id,
      dir: paths.getSqliteSegmentDir(segment.id),
    })),
    { id: "base", dir: paths.sqliteIndexesDir },
  ];
}

async function writeCheckpoint(filePath, checkpoint) {
  const nextPath = `${filePath}.next`;
  await fsPromises.writeFile(nextPath, JSON.stringify(checkpoint, null, 2));
  await fsPromises.rename(nextPath, filePath);
}

function copyAndVerify(target, sourcePath, insertSql, verifySql, fieldId = null) {
  target.prepare("ATTACH DATABASE ? AS source_index").run(sourcePath);
  try {
    target.exec("BEGIN IMMEDIATE");
    try {
      const args = fieldId === null ? [] : [fieldId];
      target.prepare(insertSql).run(...args);
      if (target.prepare(verifySql).get(...args)) {
        throw new Error(`Verification failed for ${sourcePath}`);
      }
      target.exec("COMMIT");
    } catch (error) {
      target.exec("ROLLBACK");
      throw error;
    }
  } finally {
    target.exec("DETACH DATABASE source_index");
  }
}

function validateCheckpoint(existing, sourceIds, indexedDocuments) {
  if (!existing) return;
  if (![1, MIGRATION_VERSION].includes(existing.version) ||
      JSON.stringify(existing.sourceIds) !== JSON.stringify(sourceIds) ||
      existing.indexedDocuments !== indexedDocuments) {
    throw new Error("Migration checkpoint does not match the current SQLite indexes.");
  }
}

function upgradeCheckpoint(existing, sourceIds, indexedDocuments) {
  if (!existing) {
    return {
      version: MIGRATION_VERSION,
      order: "target-shard-major",
      sourceIds,
      indexedDocuments,
      shardIndex: 0,
      sourceIndex: 0,
    };
  }
  if (existing.version === MIGRATION_VERSION) return existing;
  return {
    version: MIGRATION_VERSION,
    order: "target-shard-major",
    sourceIds,
    indexedDocuments,
    shardIndex: 0,
    sourceIndex: 0,
    legacyCoverage: {
      sourceIndex: existing.sourceIndex,
      shardIndex: existing.shardIndex,
    },
  };
}

function coveredByLegacyCheckpoint(coverage, sourceIndex, shardIndex) {
  if (!coverage) return false;
  return sourceIndex < coverage.sourceIndex ||
    (sourceIndex === coverage.sourceIndex && shardIndex < coverage.shardIndex);
}

async function acquireLock(lockPath) {
  const value = { host: os.hostname(), pid: process.pid };
  try {
    await fsPromises.writeFile(lockPath, JSON.stringify(value), { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let previous;
    try { previous = JSON.parse(await fsPromises.readFile(lockPath, "utf8")); }
    catch { throw new Error(`Migration lock is damaged: ${lockPath}`); }
    if (previous.host !== value.host || !Number.isSafeInteger(previous.pid)) {
      throw new Error(`Migration lock belongs to another host: ${lockPath}`);
    }
    try {
      process.kill(previous.pid, 0);
      throw new Error(`Migration is already running (PID ${previous.pid}).`);
    } catch (checkError) {
      if (checkError.code !== "ESRCH") throw checkError;
    }
    await fsPromises.unlink(lockPath);
    await fsPromises.writeFile(lockPath, JSON.stringify(value), { flag: "wx" });
  }
  return async () => {
    const current = await fsPromises.readFile(lockPath, "utf8").catch(() => "");
    if (current === JSON.stringify(value)) await fsPromises.unlink(lockPath);
  };
}

export async function migrateSqliteFieldIndexes({ paths, stateRepository, maxShards = Infinity, onProgress = () => {}, shouldStop = () => false }) {
  const state = await stateRepository.readSqliteIndexState(paths);
  if (!state || state.formatVersion !== SQLITE_INDEX_FORMAT_VERSION || state.status !== "completed") {
    throw new Error("Finish SQLite indexing before migrating field shards.");
  }
  if (!state.storage || !["lsm-v1", FIELD_STORAGE_MODE].includes(state.storage.mode)) {
    throw new Error("Unsupported SQLite storage layout.");
  }
  const lockPath = `${paths.sqliteFieldMigrationPath}.lock`;
  const unlock = await acquireLock(lockPath);
  const target = new SqliteIndexStore({
    paths,
    indexesDir: paths.sqliteFieldIndexesDir,
    fieldScoped: true,
    maxOpenConnections: INDEXABLE_FIELDS.length + 1,
    cacheSizeKb: 128 * 1024,
    synchronous: "NORMAL",
    walAutoCheckpointPages: 262144,
  });
  try {
    if (state.storage.mode === FIELD_STORAGE_MODE) {
      return { status: "completed", processedShards: 0 };
    }
    const sources = sourceDirectories(paths, state);
    const existing = await fsPromises.readFile(paths.sqliteFieldMigrationPath, "utf8")
      .then((value) => JSON.parse(value)).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
    const sourceIds = sources.map((source) => source.id);
    validateCheckpoint(existing, sourceIds, state.indexedDocuments);
    const checkpoint = upgradeCheckpoint(existing, sourceIds, state.indexedDocuments);
    if (existing?.version !== MIGRATION_VERSION) {
      await writeCheckpoint(paths.sqliteFieldMigrationPath, checkpoint);
    }
    const maxShardCount = Math.max(SQLITE_TERM_SHARD_COUNT, SQLITE_DOCUMENT_SHARD_COUNT);
    let processedShards = 0;
    for (let shardIndex = checkpoint.shardIndex; shardIndex < maxShardCount; shardIndex += 1) {
      for (let sourceIndex = shardIndex === checkpoint.shardIndex ? checkpoint.sourceIndex : 0;
        sourceIndex < sources.length; sourceIndex += 1) {
        const source = sources[sourceIndex];
        if (shouldStop() || processedShards >= maxShards) {
          return { status: "paused", processedShards, source: source.id, shardIndex };
        }
        if (coveredByLegacyCheckpoint(checkpoint.legacyCoverage, sourceIndex, shardIndex)) {
          checkpoint.shardIndex = shardIndex;
          checkpoint.sourceIndex = sourceIndex + 1;
          continue;
        }
        const shard = shardIndex.toString(16).padStart(2, "0");
        const sourceTermPath = path.join(source.dir, "terms", `${shard}.sqlite`);
        const sourceDocumentPath = path.join(source.dir, "documents", `${shard}.sqlite`);
        const sourceBytes = (await fsPromises.stat(sourceTermPath).then((stat) => stat.size, () => 0)) +
          (await fsPromises.stat(sourceDocumentPath).then((stat) => stat.size, () => 0));
        const disk = await fsPromises.statfs(paths.sqliteIndexesDir);
        if (disk.bavail * disk.bsize < 2 * 1024 ** 3 + sourceBytes * 3) {
          throw new Error("Insufficient free space for the next SQLite shard; migration is safely paused.");
        }
        if (shardIndex < SQLITE_TERM_SHARD_COUNT && fs.existsSync(sourceTermPath)) {
          for (let fieldIndex = 0; fieldIndex < INDEXABLE_FIELDS.length; fieldIndex += 1) {
            const fieldId = fieldIndex + 1;
            const field = INDEXABLE_FIELDS[fieldIndex];
            const sourceDb = new DatabaseSync(sourceTermPath, { readOnly: true });
            let hasRows;
            try {
              hasRows = Boolean(sourceDb.prepare("SELECT 1 FROM postings WHERE field_id = ? LIMIT 1").get(fieldId));
            } finally {
              sourceDb.close();
            }
            if (!hasRows) continue;
            copyAndVerify(
              target.openTermShard(shard, field),
              sourceTermPath,
              "INSERT OR IGNORE INTO postings(field_id, term, doc_key) SELECT field_id, term, doc_key FROM source_index.postings WHERE field_id = ?",
              "SELECT 1 FROM source_index.postings p WHERE p.field_id = ? AND NOT EXISTS (SELECT 1 FROM postings t WHERE t.field_id = p.field_id AND t.term = p.term AND t.doc_key = p.doc_key) LIMIT 1",
              fieldId
            );
          }
        }
        if (shardIndex < SQLITE_DOCUMENT_SHARD_COUNT && fs.existsSync(sourceDocumentPath)) {
          copyAndVerify(
            target.openDocumentShard(shard),
            sourceDocumentPath,
            "INSERT OR IGNORE INTO documents(doc_key, doc_id, file_name, byte_offset, byte_length, source_table) SELECT doc_key, doc_id, file_name, byte_offset, byte_length, source_table FROM source_index.documents",
            "SELECT 1 FROM source_index.documents s WHERE NOT EXISTS (SELECT 1 FROM documents t WHERE t.doc_key = s.doc_key) LIMIT 1"
          );
        }
        processedShards += 1;
        checkpoint.shardIndex = shardIndex;
        checkpoint.sourceIndex = sourceIndex + 1;
        await writeCheckpoint(paths.sqliteFieldMigrationPath, checkpoint);
        onProgress({ source: source.id, sourceIndex: sourceIndex + 1, sourcesTotal: sources.length, shardIndex: shardIndex + 1, shardsTotal: maxShardCount });
      }
      checkpoint.shardIndex = shardIndex + 1;
      checkpoint.sourceIndex = 0;
      await writeCheckpoint(paths.sqliteFieldMigrationPath, checkpoint);
    }
    target.close();
    state.storage = { mode: FIELD_STORAGE_MODE, termShardCount: SQLITE_TERM_SHARD_COUNT, documentShardCount: SQLITE_DOCUMENT_SHARD_COUNT };
    state.wildcard = { status: "pending", indexedDocuments: 0, completedShards: [] };
    state.updatedAt = new Date().toISOString();
    await stateRepository.writeSqliteIndexState(paths, state);
    return { status: "completed", processedShards };
  } finally {
    target.close();
    await unlock();
  }
}

export async function pruneMigratedSqliteIndexes({ paths, stateRepository }) {
  const state = await stateRepository.readSqliteIndexState(paths);
  const checkpoint = JSON.parse(await fsPromises.readFile(paths.sqliteFieldMigrationPath, "utf8"));
  if (state?.storage?.mode !== FIELD_STORAGE_MODE ||
      (checkpoint.version === 1
        ? checkpoint.sourceIndex !== checkpoint.sourceIds.length
        : checkpoint.shardIndex < Math.max(SQLITE_TERM_SHARD_COUNT, SQLITE_DOCUMENT_SHARD_COUNT))) {
    throw new Error("Field migration is not fully completed; old indexes cannot be removed.");
  }
  const targets = [
    paths.sqliteSegmentsDir,
    paths.sqliteTermIndexesDir,
    path.join(paths.sqliteIndexesDir, "documents"),
  ];
  for (const target of targets) {
    const relative = path.relative(paths.sqliteIndexesDir, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Unsafe cleanup target: ${target}`);
    }
    await fsPromises.rm(target, { recursive: true, force: true });
  }
}
