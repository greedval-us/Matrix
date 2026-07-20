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

  get importStatePath() {
    return path.join(this.stateDir, "import_state.json");
  }

  get indexStatePath() {
    return path.join(this.stateDir, "index_state.json");
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

  getIndexBucketPath(field, bucketName, indexesDir = this.indexesDir) {
    return path.join(this.getIndexFieldDir(field, indexesDir), `${bucketName}.jsonl`);
  }

  getDocumentLookupDir(indexesDir = this.indexesDir) {
    return path.join(indexesDir, DOCUMENT_LOOKUP_DIRNAME);
  }

  getDocumentLookupBucketPath(bucketName, indexesDir = this.indexesDir) {
    return path.join(this.getDocumentLookupDir(indexesDir), `${bucketName}.jsonl`);
  }

  getImportOutputPath(importId) {
    return path.join(this.documentsDir, `import_${importId}.jsonl`);
  }

  getTempPath(name) {
    return path.join(this.tempDir, name);
  }
}
