import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_SERVER_CONFIG, SERVER_CONFIG_LIMITS, boundedConfigInteger } from "../../shared/constants/serverConfig.js";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const bundledCertificatePath = path.resolve(moduleDirectory, "../../public/certs/arm-5.crt");

const DEFAULT_CONFIG = Object.freeze({
  ...DEFAULT_SERVER_CONFIG,
  apiKey: "",
});

const LEGACY_DEFAULT_ENDPOINTS = new Set(["arm-5:50051"]);

function configLimits(input, fallback) {
  return {
    pageSize: boundedConfigInteger(input.pageSize, fallback.pageSize, SERVER_CONFIG_LIMITS.pageSize),
    connectionTimeoutMs: boundedConfigInteger(input.connectionTimeoutMs, fallback.connectionTimeoutMs, SERVER_CONFIG_LIMITS.requestTimeoutMs),
  };
}

function normalizeEndpoint(value) {
  const endpoint = String(value || "")
    .trim()
    .replace(/^grpcs?:\/\//i, "")
    .replace(/\/+$/, "");
  const match = endpoint.match(/^([a-z0-9.-]+):(\d{1,5})$/i);
  if (!match) throw new Error("Адрес сервера должен быть в формате host:port");
  const port = Number.parseInt(match[2], 10);
  if (port < 1 || port > 65535) throw new Error("Указан недопустимый порт сервера");
  return `${match[1]}:${port}`;
}

function migrateStoredEndpoint(value) {
  const endpoint = String(value || "").trim();
  return LEGACY_DEFAULT_ENDPOINTS.has(endpoint) ? DEFAULT_CONFIG.endpoint : endpoint;
}

export class ServerConnectionService {
  constructor(storeService, { environment = process.env, readCertificate = fs.readFile } = {}) {
    this.storeService = storeService;
    this.environment = environment;
    this.readCertificate = readCertificate;
  }

  getStoredConfig() {
    const stored = this.storeService.get("searchServer") || {};
    const storedEndpoint = migrateStoredEndpoint(stored.endpoint);
    return {
      ...DEFAULT_CONFIG,
      ...stored,
      endpoint: storedEndpoint || DEFAULT_CONFIG.endpoint,
      apiKey: String(stored.apiKey || ""),
      caCertificatePath: String(stored.caCertificatePath || ""),
      ...configLimits(stored, DEFAULT_CONFIG),
    };
  }

  getPublicConfig() {
    const config = this.getStoredConfig();
    return {
      endpoint: config.endpoint,
      caCertificatePath: config.caCertificatePath,
      bundledCertificatePath,
      pageSize: config.pageSize,
      connectionTimeoutMs: config.connectionTimeoutMs,
      hasApiKey: Boolean(config.apiKey || this.environment.MATRIX_API_KEY),
    };
  }

  async updateConfig(input = {}) {
    const current = this.getStoredConfig();
    const next = {
      endpoint: normalizeEndpoint(input.endpoint ?? current.endpoint),
      tlsServerName: String(input.tlsServerName ?? current.tlsServerName).trim(),
      apiKey: input.clearApiKey
        ? ""
        : String(input.apiKey || "").trim() || current.apiKey,
      caCertificatePath: String(input.caCertificatePath ?? current.caCertificatePath).trim(),
      ...configLimits(input, current),
    };

    await this.validateCertificate(next.caCertificatePath || bundledCertificatePath);
    this.storeService.set("searchServer", next);
    return this.getPublicConfig();
  }

  async getResolvedConfig(overrides = {}) {
    const stored = this.getStoredConfig();
    const config = {
      ...stored,
      ...overrides,
      endpoint: normalizeEndpoint(overrides.endpoint ?? stored.endpoint),
      tlsServerName: String(overrides.tlsServerName ?? stored.tlsServerName).trim(),
      apiKey: String(
        overrides.apiKey || this.environment.MATRIX_API_KEY || stored.apiKey || ""
      ).trim(),
      caCertificatePath: String(
        overrides.caCertificatePath ?? stored.caCertificatePath
      ).trim(),
      ...configLimits(overrides, stored),
    };
    if (!config.apiKey) throw new Error("API-ключ сервера не настроен");

    const certificatePath = config.caCertificatePath || bundledCertificatePath;
    const caCertificate = await this.validateCertificate(certificatePath);
    return { ...config, certificatePath, caCertificate };
  }

  async validateCertificate(certificatePath) {
    let certificate;
    try {
      certificate = await this.readCertificate(certificatePath);
    } catch (error) {
      throw new Error(`Не удалось прочитать TLS-сертификат: ${certificatePath}`, {
        cause: error,
      });
    }
    if (!certificate.includes("-----BEGIN CERTIFICATE-----")) {
      throw new Error("Выбранный файл не содержит TLS-сертификат PEM");
    }
    return certificate;
  }
}

export { DEFAULT_CONFIG, bundledCertificatePath, normalizeEndpoint };
