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
export const DEFAULT_DATABASE_FOLDER_NAME = "MatrixData";
export const STORAGE_KEY = "databaseRootPath";
export const LOCAL_DATABASE_FORMAT = "matrix-local-db";
export const LOCAL_DATABASE_VERSION = 2;
export const MAX_RESULTS = 250;
export const BUFFER_FLUSH_SIZE = 1000;
export const PROGRESS_SAVE_INTERVAL = 5000;
export const IMPORT_PROGRESS_INTERVAL = 250;
export const MAX_IMPORT_FILES = 1000;
export const MAX_IMPORT_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const IMPORT_WRITE_BATCH_SIZE = 500;
export const INDEX_BUILD_TEMP_PREFIX = "index-build";
export const INDEX_BACKUP_TEMP_PREFIX = "index-backup";
