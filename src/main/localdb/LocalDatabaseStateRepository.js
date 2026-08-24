import fs from "fs/promises";
import {
  DEFAULT_SEARCH_BACKEND_CONFIG,
  DOCUMENT_LOOKUP_FORMAT_VERSION,
  INDEXABLE_FIELDS,
  LOCAL_DATABASE_FORMAT,
  LOCAL_DATABASE_VERSION,
} from "./constants.js";
import {
  buildRecommendedBucketLayoutMap,
  resolveGlobalBucketLayoutVersion,
} from "./indexBucketLayouts.js";

export class LocalDatabaseStateRepository {
  async readJson(filePath, fallbackValue = null) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const normalizedContent = content.replace(/^\uFEFF/u, "");
      return JSON.parse(normalizedContent);
    } catch {
      return fallbackValue;
    }
  }

  async writeJson(filePath, value) {
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  async readSources(paths) {
    return await this.readJson(paths.sourcesMetaPath, []);
  }

  async mergeSources(paths, sourceMetaMap) {
    const existingSources = await this.readSources(paths);
    const sourcesByTable = new Map(
      existingSources.map((source) => [source.sourceTable, source])
    );

    for (const [sourceTable, sourceMeta] of sourceMetaMap.entries()) {
      sourcesByTable.set(sourceTable, sourceMeta);
    }

    await this.writeJson(paths.sourcesMetaPath, Array.from(sourcesByTable.values()));
  }

  async readImportState(paths) {
    return await this.readJson(paths.importStatePath, null);
  }

  async writeImportState(paths, summary) {
    await this.writeJson(paths.importStatePath, summary);
  }

  async readIndexState(paths) {
    return await this.readJson(paths.indexStatePath, null);
  }

  async writeIndexState(paths, summary) {
    await this.writeJson(paths.indexStatePath, summary);
  }

  async readIndexBucketStats(paths) {
    return await this.readJson(paths.indexBucketStatsPath, null);
  }

  async writeIndexBucketStats(paths, stats) {
    await this.writeJson(paths.indexBucketStatsPath, stats);
  }

  async readSearchBackendConfig(paths) {
    return await this.readJson(paths.searchBackendConfigPath, DEFAULT_SEARCH_BACKEND_CONFIG);
  }

  async writeSearchBackendConfig(paths, config) {
    await this.writeJson(paths.searchBackendConfigPath, config);
  }

  async readSqliteIndexState(paths) {
    return await this.readJson(paths.sqliteIndexStatePath, null);
  }

  async writeSqliteIndexState(paths, state) {
    const temporaryPath = `${paths.sqliteIndexStatePath}.next`;
    await this.writeJson(temporaryPath, state);
    await fs.rename(temporaryPath, paths.sqliteIndexStatePath);
  }

  async updateDatabaseMeta(paths, updater) {
    const meta = await this.readJson(paths.databaseMetaPath, null);
    if (!meta) return;

    const updatedMeta = updater(meta) || meta;
    await this.writeJson(paths.databaseMetaPath, updatedMeta);
  }

  buildDatabaseMeta(now) {
    const bucketLayouts = buildRecommendedBucketLayoutMap();

    return {
      format: LOCAL_DATABASE_FORMAT,
      version: LOCAL_DATABASE_VERSION,
      createdAt: now,
      updatedAt: now,
      storage: {
        engine: "rocksdb",
        status: "empty",
      },
      indexes: {
        version: 1,
        fields: INDEXABLE_FIELDS,
        lookupFormatVersion: DOCUMENT_LOOKUP_FORMAT_VERSION,
        bucketLayoutVersion: resolveGlobalBucketLayoutVersion(bucketLayouts),
        bucketLayouts,
      },
    };
  }

  buildInitialIndexState(now) {
    return {
      lastIndexedSource: null,
      indexedDocuments: 0,
      updatedAt: now,
    };
  }
}
