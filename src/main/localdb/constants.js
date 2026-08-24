export const INDEXABLE_FIELDS = [
  "number",
  "mail",
  "fio",
  "passport",
  "inn",
  "snils",
  "telegram",
  "vk",
  "facebook",
  "grz",
  "vin",
  "date_of_birth",
];

export const SEARCHABLE_KEYS = [
  "vk",
  "number",
  "fio",
  "inn",
  "passport",
  "imei",
  "imsi",
  "telegram",
  "facebook",
  "snils",
  "mail",
  "grz",
  "sts",
  "pts",
  "vin",
  "date_of_birth",
];

export const DOCUMENT_LOOKUP_DIRNAME = "_documents";
export const DOCUMENT_LOOKUP_FORMAT_VERSION = 6;
export const DEFAULT_DATABASE_FOLDER_NAME = "MatrixData";
export const STORAGE_KEY = "databaseRootPath";
export const MAX_RESULTS = 250;
export const SEARCH_BACKEND_EMBEDDED = "embedded";
export const SEARCH_BACKEND_SQLITE = "sqlite";
export const DEFAULT_SEARCH_BACKEND_CONFIG = Object.freeze({
  backend: SEARCH_BACKEND_SQLITE,
  sqlite: {
    maxResults: MAX_RESULTS,
  },
});
export const LOCAL_DATABASE_FORMAT = "matrix-local-db";
export const LOCAL_DATABASE_VERSION = 2;
export const BUFFER_FLUSH_SIZE = 10000;
export const PROGRESS_SAVE_INTERVAL = 10000;
export const PROGRESS_EMIT_INTERVAL = 10000;
export const IMPORT_PROGRESS_INTERVAL = 250;
export const MAX_IMPORT_FILES = 1000;
export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const IMPORT_WRITE_BATCH_SIZE = 500;
export const DEFAULT_DOCUMENT_SEGMENT_SIZE_BYTES = 1024 * 1024 * 1024;
export const INDEX_BUILD_TEMP_PREFIX = "index-build";
export const INDEX_BACKUP_TEMP_PREFIX = "index-backup";
export const SEARCH_STREAM_CHUNK_SIZE = 200;
export const SQLITE_INDEX_FORMAT_VERSION = 3;
export const SQLITE_TERM_SHARD_COUNT = 64;
export const SQLITE_DOCUMENT_SHARD_COUNT = 64;
export const SQLITE_INDEX_BATCH_DOCUMENTS = 100000;
export const SQLITE_WILDCARD_MIN_LITERAL_LENGTH = 3;
export const LEGACY_INDEX_BUCKET_LAYOUT_VERSION = 1;
export const OPTIMIZED_INDEX_BUCKET_LAYOUT_VERSION = 2;
