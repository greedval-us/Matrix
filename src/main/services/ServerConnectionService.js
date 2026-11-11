import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { DEFAULT_SERVER_CONFIG, SERVER_CONFIG_LIMITS, boundedConfigInteger } from "../../shared/constants/serverConfig.js";
import { DeviceAccessCredentials, isDeviceApiKey } from "./DeviceAccessCredentials.js";

const DEFAULT_CONFIG = Object.freeze({
  ...DEFAULT_SERVER_CONFIG,
  apiKey: "",
});

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

function deviceAuthority(config, certificate) {
  return JSON.stringify([config.endpoint, config.tlsServerName, createHash("sha256").update(certificate).digest("hex")]);
}

export class ServerConnectionService {
  constructor(storeService, {
    environment = process.env, readCertificate = fs.readFile, bundledCertificatePath = "",
    safeStorage, deviceIdentityStore, platform,
  } = {}) {
    this.storeService = storeService;
    this.environment = environment;
    this.readCertificate = readCertificate;
    this.bundledCertificatePath = bundledCertificatePath;
    this.deviceCredentials = new DeviceAccessCredentials({ safeStorage, identityStore: deviceIdentityStore, platform });
  }

  getStoredConfig() {
    const stored = this.storeService.get("searchServer") || {};
    const storedEndpoint = String(stored.endpoint || "").trim();
    return {
      ...DEFAULT_CONFIG,
      endpoint: storedEndpoint || DEFAULT_CONFIG.endpoint,
      tlsServerName: String(stored.tlsServerName || ""),
      apiKey: String(stored.apiKey || ""),
      protectedApiKey: String(stored.protectedApiKey || ""),
      ...configLimits(stored, DEFAULT_CONFIG),
    };
  }

  getPublicConfig() {
    const config = this.getStoredConfig();
    return {
      endpoint: config.endpoint,
      hasBundledCertificate: Boolean(this.bundledCertificatePath),
      pageSize: config.pageSize,
      connectionTimeoutMs: config.connectionTimeoutMs,
      hasApiKey: Boolean(config.apiKey || config.protectedApiKey || this.environment.MATRIX_API_KEY),
    };
  }

  async updateConfig(input = {}) {
    const current = this.getStoredConfig();
    const enteredKey = String(input.apiKey || "").trim();
    const next = {
      endpoint: normalizeEndpoint(input.endpoint ?? current.endpoint),
      tlsServerName: String(input.tlsServerName ?? current.tlsServerName).trim(),
      apiKey: input.clearApiKey ? "" : enteredKey || current.apiKey,
      ...configLimits(input, current),
    };

    const certificate = await this.readBundledCertificate();
    if (!input.clearApiKey && !enteredKey && current.protectedApiKey) {
      this.deviceCredentials.openApiKey(current.protectedApiKey, deviceAuthority(next, certificate));
      next.protectedApiKey = current.protectedApiKey;
    } else if (isDeviceApiKey(next.apiKey)) {
      next.protectedApiKey = this.deviceCredentials.protectApiKey(next.apiKey, deviceAuthority(next, certificate));
      next.apiKey = "";
    }
    this.storeService.set("searchServer", next);
    return this.getPublicConfig();
  }

  async getResolvedConfig(overrides = {}) {
    const stored = this.getStoredConfig();
    const config = {
      endpoint: normalizeEndpoint(overrides.endpoint ?? stored.endpoint),
      tlsServerName: String(overrides.tlsServerName ?? stored.tlsServerName).trim(),
      apiKey: String(
        overrides.apiKey || this.environment.MATRIX_API_KEY || stored.apiKey || ""
      ).trim(),
      ...configLimits(overrides, stored),
    };
    if (!config.apiKey && !stored.protectedApiKey) throw new Error("API-ключ сервера не настроен");

    const caCertificate = await this.readBundledCertificate();
    if (!config.apiKey) config.apiKey = this.deviceCredentials.openApiKey(stored.protectedApiKey, deviceAuthority(config, caCertificate));
    if (isDeviceApiKey(config.apiKey)) config.signDeviceRequest = this.deviceCredentials.createSigner(config.apiKey);
    return { ...config, certificatePath: this.bundledCertificatePath, caCertificate };
  }

  async readBundledCertificate() {
    if (!this.bundledCertificatePath) {
      throw new Error("В сборке Matrix отсутствует встроенный CA-сертификат сервера");
    }
    let certificate;
    try {
      certificate = await this.readCertificate(this.bundledCertificatePath);
    } catch (error) {
      throw new Error("Не удалось прочитать встроенный CA-сертификат сервера", {
        cause: error,
      });
    }
    if (!certificate.includes("-----BEGIN CERTIFICATE-----")) {
      throw new Error("Встроенный CA-сертификат сервера должен быть в формате PEM");
    }
    return certificate;
  }
}

export { DEFAULT_CONFIG, normalizeEndpoint };
