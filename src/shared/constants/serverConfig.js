export const BUNDLED_CA_FILENAME = "matrix-server-ca.crt";

export const DEFAULT_SERVER_CONFIG = Object.freeze({
  endpoint: "localhost:50051",
  tlsServerName: "",
  pageSize: 1000,
  connectionTimeoutMs: 30000,
});

export const SERVER_CONFIG_LIMITS = Object.freeze({
  pageSize: Object.freeze({ min: 50, max: 10000, step: 50 }),
  requestTimeoutMs: Object.freeze({ min: 1000, max: 120000, step: 1000 }),
});

export function boundedConfigInteger(value, fallback, { min, max }) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}
