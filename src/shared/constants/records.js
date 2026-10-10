export const DEFAULT_RECORDS_PAGE_SIZE = 25;
export const RECORDS_PAGE_SIZES = Object.freeze([25, 50, 100]);
export const RECORDS_QUERY_MAX_LENGTH = 2000;
export const RECORDS_IDENTIFIER_MAX_LENGTH = 512;
export const RECORDS_SEARCH_DELAY_MS = 300;
export const RECORDS_UNAVAILABLE_MESSAGE = 'Данные появятся после подключения серверного API этого раздела.';

export const UNAVAILABLE_RECORDS_CAPABILITIES = Object.freeze({
  available: false, list: false, upload: false, download: false, remove: false,
  message: RECORDS_UNAVAILABLE_MESSAGE,
});
