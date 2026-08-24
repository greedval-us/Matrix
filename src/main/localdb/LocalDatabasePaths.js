import path from "path";
import { DOCUMENT_LOOKUP_DIRNAME } from "./constants.js";

export class LocalDatabasePaths {
  constructor(rootPath) {
    this.rootPath = rootPath;
  }

  get documentsDir() {
    return path.join(this.rootPath, "documents");
  }

  get indexesDir() {
    return path.join(this.rootPath, "indexes");
  }

  get stateDir() {
    return path.join(this.rootPath, "state");
  }

  get metaDir() {
    return path.join(this.rootPath, "meta");
  }

  get tempDir() {
    return path.join(this.rootPath, "temp");
  }

  get databaseMetaPath() {
    return path.join(this.metaDir, "db.json");
  }

  get sourcesMetaPath() {
    return path.join(this.metaDir, "sources.json");
  }

  get indexBucketStatsPath() {
    return path.join(this.metaDir, "index_bucket_stats.json");
  }

  get searchBackendConfigPath() {
    return path.join(this.metaDir, "search_backend.json");
  }

  get importStatePath() {
    return path.join(this.stateDir, "import_state.json");
  }

  get indexStatePath() {
    return path.join(this.stateDir, "index_state.json");
  }

  get sqliteIndexStatePath() {
    return path.join(this.stateDir, "sqlite_index_state.json");
  }

  get sqliteIndexesDir() {
    return path.join(this.rootPath, "sqlite-indexes-v3");
  }

  get legacySqliteIndexesDir() {
    return path.join(this.rootPath, "sqlite-indexes-v1");
  }

  get legacySqliteV2IndexesDir() {
    return path.join(this.rootPath, "sqlite-indexes-v2");
  }

  get sqliteTermIndexesDir() {
    return path.join(this.sqliteIndexesDir, "terms");
  }

  getSqliteTermShardPath(shard) {
    return path.join(this.sqliteTermIndexesDir, `${shard}.sqlite`);
  }

  getSqliteDocumentShardPath(shard) {
    return path.join(this.sqliteIndexesDir, "documents", `${shard}.sqlite`);
  }

  get readmePath() {
    return path.join(this.rootPath, "README.txt");
  }

  get documentLookupDir() {
    return this.getDocumentLookupDir();
  }

  getIndexFieldDir(field, indexesDir = this.indexesDir) {
    return path.join(indexesDir, field);
  }

  getDocumentPath(fileName) {
    return path.join(this.documentsDir, fileName);
  }

  getIndexBucketPath(field, bucketName, indexesDir = this.indexesDir) {
    const normalizedBucketName = String(bucketName).trim();
    const fieldDir = this.getIndexFieldDir(field, indexesDir);

    if (normalizedBucketName.length <= 2) {
      return path.join(fieldDir, `${normalizedBucketName}.jsonl`);
    }

    return path.join(
      fieldDir,
      normalizedBucketName.slice(0, 2),
      `${normalizedBucketName}.jsonl`
    );
  }

  getDocumentLookupDir(indexesDir = this.indexesDir) {
    return path.join(indexesDir, DOCUMENT_LOOKUP_DIRNAME);
  }

  getDocumentLookupBucketPath(bucketName, indexesDir = this.indexesDir) {
    const normalizedBucketName = String(bucketName).trim().toLowerCase();
    const lookupDir = this.getDocumentLookupDir(indexesDir);

    if (normalizedBucketName.length <= 2) {
      return path.join(lookupDir, `${normalizedBucketName}.jsonl`);
    }

    return path.join(
      lookupDir,
      normalizedBucketName.slice(0, 2),
      `${normalizedBucketName}.jsonl`
    );
  }

  getImportOutputPath(importId) {
    return this.getDocumentPath(`import_${importId}.jsonl`);
  }

  getTempPath(name) {
    return path.join(this.tempDir, name);
  }
}
