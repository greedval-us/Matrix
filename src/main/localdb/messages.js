export const localDbMessages = {
  databaseNotInitialized: "Local database is not initialized",
  noJsonFilesFound: "No JSON files found in the selected import folder",
  noIndexedDocuments: "No imported document files found for indexing",
  importSourceInsideDatabase:
    "Import source folder cannot be inside the local database directory",
  pathRequired: "Path is required",
  importAlreadyRunning: 'Operation "local-db-import" is already running',
  indexAlreadyRunning: 'Operation "local-db-index" is already running',
  searchBaseInfo(fileName) {
    return `Import from file ${fileName}`;
  },
  localSourceInfo: "Local source",
  tooManyImportFiles(limit) {
    return `Too many import files. Maximum allowed: ${limit}`;
  },
  invalidSourceTable(fileName) {
    return `File "${fileName}" does not produce a valid source table name`;
  },
  importFileTooLarge(filePath, maxSize) {
    return `Import file is too large: ${filePath}. Maximum size is ${maxSize} bytes`;
  },
};
