import fs from "node:fs/promises";
import {
  SQLITE_INDEX_FORMAT_VERSION,
  SQLITE_TERM_SHARD_COUNT,
} from "../../localdb/constants.js";
import { LocalDatabasePaths } from "../../localdb/LocalDatabasePaths.js";

export class BuildSqliteWildcardIndexesUseCase {
  constructor({ localDatabaseService, stateRepository, indexStore }) {
    this.localDatabaseService = localDatabaseService;
    this.stateRepository = stateRepository;
    this.indexStore = indexStore;
    this.cancelRequested = false;
  }

  cancel() {
    this.cancelRequested = true;
  }

  async execute(options = {}) {
    this.cancelRequested = false;
    const rootPath = this.localDatabaseService.getStoredRootPath();
    await this.localDatabaseService.ensureReady(rootPath);
    const paths = new LocalDatabasePaths(rootPath);
    if (await fs.access(`${paths.sqliteFieldMigrationPath}.lock`).then(() => true, () => false)) {
      throw new Error("SQLite field migration is running; do not build wildcard indexes concurrently.");
    }
    const state = await this.stateRepository.readSqliteIndexState(paths);
    if (!state || state.formatVersion !== SQLITE_INDEX_FORMAT_VERSION) {
      throw new Error("SQLite core indexes v3 have not been built.");
    }
    if (state.status === "running") {
      throw new Error("Stop core SQLite indexing before building wildcard indexes.");
    }
    this.indexStore.configure?.(state);

    const sameSnapshot = state.wildcard?.indexedDocuments === state.indexedDocuments;
    const completedShards = sameSnapshot
      ? new Set(state.wildcard?.completedShards || [])
      : new Set();
    state.wildcard = {
      status: "running",
      indexedDocuments: state.indexedDocuments,
      completedShards: [...completedShards],
      updatedAt: new Date().toISOString(),
    };
    await this.stateRepository.writeSqliteIndexState(paths, state);

    const targets = this.indexStore.getWildcardTargets?.() || ["base"];
    const totalShards = targets.length * SQLITE_TERM_SHARD_COUNT;
    for (const target of targets) {
      for (let index = 0; index < SQLITE_TERM_SHARD_COUNT; index += 1) {
        if (this.cancelRequested) break;
        const shard = index.toString(16).padStart(2, "0");
        const checkpoint = target === "base" ? shard : `${target}:${shard}`;
        if (completedShards.has(checkpoint)) continue;
        this.indexStore.rebuildWildcardShard(shard, target);
        completedShards.add(checkpoint);
      state.wildcard.completedShards = [...completedShards];
      state.wildcard.updatedAt = new Date().toISOString();
      await this.stateRepository.writeSqliteIndexState(paths, state);
      options.onProgress?.({
        status: "running",
        shardsProcessed: completedShards.size,
        shardsTotal: totalShards,
        shard: checkpoint,
      });
      }
      if (this.cancelRequested) break;
    }

    state.wildcard.status = completedShards.size === totalShards
      ? "completed"
      : "cancelled";
    state.wildcard.updatedAt = new Date().toISOString();
    await this.stateRepository.writeSqliteIndexState(paths, state);
    options.onProgress?.({
      status: state.wildcard.status,
      shardsProcessed: completedShards.size,
      shardsTotal: totalShards,
      shard: null,
    });
    return state;
  }
}
