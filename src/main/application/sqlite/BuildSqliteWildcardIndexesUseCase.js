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
    const state = await this.stateRepository.readSqliteIndexState(paths);
    if (!state || state.formatVersion !== SQLITE_INDEX_FORMAT_VERSION) {
      throw new Error("SQLite core indexes v3 have not been built.");
    }
    if (state.status === "running") {
      throw new Error("Stop core SQLite indexing before building wildcard indexes.");
    }

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

    for (let index = 0; index < SQLITE_TERM_SHARD_COUNT; index += 1) {
      if (this.cancelRequested) break;
      const shard = index.toString(16).padStart(2, "0");
      if (completedShards.has(shard)) continue;
      this.indexStore.rebuildWildcardShard(shard);
      completedShards.add(shard);
      state.wildcard.completedShards = [...completedShards];
      state.wildcard.updatedAt = new Date().toISOString();
      await this.stateRepository.writeSqliteIndexState(paths, state);
      options.onProgress?.({
        status: "running",
        shardsProcessed: completedShards.size,
        shardsTotal: SQLITE_TERM_SHARD_COUNT,
        shard,
      });
    }

    state.wildcard.status = completedShards.size === SQLITE_TERM_SHARD_COUNT
      ? "completed"
      : "cancelled";
    state.wildcard.updatedAt = new Date().toISOString();
    await this.stateRepository.writeSqliteIndexState(paths, state);
    options.onProgress?.({
      status: state.wildcard.status,
      shardsProcessed: completedShards.size,
      shardsTotal: SQLITE_TERM_SHARD_COUNT,
      shard: null,
    });
    return state;
  }
}
