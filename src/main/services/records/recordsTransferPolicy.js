export const MEBIBYTE_BYTES = 1024 * 1024;

export const RECORDS_TRANSFER_LIMITS = Object.freeze({
  chunkBytes: 64 * 1024,
  maxFileBytes: 25 * MEBIBYTE_BYTES,
  maxBatchBytes: 100 * MEBIBYTE_BYTES,
  maxFiles: 20,
  timeoutMs: 120000,
});
