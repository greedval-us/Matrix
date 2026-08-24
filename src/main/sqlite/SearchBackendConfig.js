import {
  MAX_RESULTS,
  SEARCH_BACKEND_EMBEDDED,
  SEARCH_BACKEND_SQLITE,
} from "../localdb/constants.js";

export function normalizeSearchBackendConfig(value = {}) {
  const backend = value.backend === SEARCH_BACKEND_SQLITE
    ? SEARCH_BACKEND_SQLITE
    : SEARCH_BACKEND_EMBEDDED;
  const requestedMaxResults = Number(value.sqlite?.maxResults);
  const maxResults = Number.isFinite(requestedMaxResults)
    ? Math.min(Math.max(Math.trunc(requestedMaxResults), 1), 10_000)
    : MAX_RESULTS;
  return {
    backend,
    sqlite: {
      maxResults,
    },
  };
}
