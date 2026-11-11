import assert from "node:assert/strict";
import { createHash, createPublicKey, verify } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ServerConnectionService,
  normalizeEndpoint,
} from "../../../src/main/services/ServerConnectionService.js";

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}

const deviceApiKey = `mxk_${"A".repeat(43)}`;
const statusMethod = "/base_search.BaseSearches/GetIndexStatus";

function deviceOptions() {
  const protectedValues = new Map();
  let identity;
  return {
    environment: {},
    platform: "win32",
    bundledCertificatePath: "bundled.crt",
    readCertificate: async () => Buffer.from("-----BEGIN CERTIFICATE-----"),
    deviceIdentityStore: { getOrCreate: (create) => identity ??= create() },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString(value) {
        const ciphertext = `encrypted-${protectedValues.size}`;
        protectedValues.set(ciphertext, value);
        return Buffer.from(ciphertext);
      },
      decryptString(ciphertext) {
        const value = protectedValues.get(ciphertext.toString());
        if (!value) throw new Error("wrong Windows profile");
        return value;
      },
    },
  };
}

test("the first device test prepares a persistent signer before sending a request", async () => {
  const store = memoryStore();
  const options = deviceOptions();
  const first = new ServerConnectionService(store, options);
  const tested = await first.getResolvedConfig({ apiKey: deviceApiKey });
  const proof = tested.signDeviceRequest(statusMethod);
  const again = new ServerConnectionService(store, options);
  const afterRestart = (await again.getResolvedConfig({ apiKey: deviceApiKey })).signDeviceRequest(statusMethod);

  assert.equal(proof["x-matrix-device-key"], afterRestart["x-matrix-device-key"]);
  assert.notEqual(proof["x-matrix-device-nonce"], afterRestart["x-matrix-device-nonce"]);
  assert.equal(Buffer.from(proof["x-matrix-device-nonce"], "base64url").length, 16);
  assert.match(proof["x-matrix-device-time"], /^\d+$/);
  const publicKey = createPublicKey({ key: Buffer.from(proof["x-matrix-device-key"], "base64url"), format: "der", type: "spki" });
  const message = ["matrix-device-v1", statusMethod, createHash("sha256").update(deviceApiKey).digest("hex"),
    proof["x-matrix-device-time"], proof["x-matrix-device-nonce"]].join("\n");
  const signature = Buffer.from(proof["x-matrix-device-signature"], "base64url");
  assert.equal(signature.length, 64);
  assert.equal(verify(null, Buffer.from(message), publicKey, signature), true);
  assert.equal(verify(null, Buffer.from(message.replace(statusMethod, "/base_search.BaseSearches/StreamSearch")), publicKey, signature), false);
});

test("device keys are protected at rest and stay scoped to their saved server", async () => {
  const store = memoryStore();
  const options = deviceOptions();
  const service = new ServerConnectionService(store, options);
  const config = await service.updateConfig({ endpoint: "matrix.local:50051", apiKey: deviceApiKey });
  assert.equal(config.hasApiKey, true);
  assert.doesNotMatch(JSON.stringify(config), /mxk_|encrypted/);
  assert.doesNotMatch(JSON.stringify(store.get("searchServer")), /mxk_/);
  assert.equal((await new ServerConnectionService(store, options).getResolvedConfig()).apiKey, deviceApiKey);
  await assert.rejects(service.getResolvedConfig({ endpoint: "other.local:50051" }), /Введите.*ключ/);
  await assert.rejects(service.updateConfig({ endpoint: "other.local:50051" }), /Введите.*ключ/);
  assert.equal((await service.getResolvedConfig()).endpoint, "matrix.local:50051");
  await service.updateConfig({ clearApiKey: true });
  await assert.rejects(service.getResolvedConfig(), /ключ сервера не настроен/);
});

test("device authentication fails closed without protected storage", async () => {
  const store = memoryStore();
  const options = { ...deviceOptions(), safeStorage: { isEncryptionAvailable: () => false } };
  const service = new ServerConnectionService(store, options);
  await assert.rejects(service.getResolvedConfig({ apiKey: deviceApiKey }), /защищённое хранилище/i);
  await assert.rejects(service.updateConfig({ apiKey: deviceApiKey }), /защищённое хранилище/i);
  assert.equal(store.get("searchServer"), undefined);
  await service.updateConfig({ apiKey: "legacy-secret" });
  assert.equal((await service.getResolvedConfig()).apiKey, "legacy-secret");
});

test("server connection config normalizes endpoints and never exposes the API key", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-server-config-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const certificatePath = path.join(directory, "server.crt");
  await fs.writeFile(
    certificatePath,
    "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n"
  );
  const service = new ServerConnectionService(memoryStore(), { bundledCertificatePath: certificatePath });
  assert.equal(service.getPublicConfig().endpoint, "localhost:50051");
  assert.equal("bundledCertificatePath" in service.getPublicConfig(), false);
  assert.equal(service.getPublicConfig().connectionTimeoutMs, 30000);

  const publicConfig = await service.updateConfig({
    endpoint: "grpcs://matrix.local:50051/",
    apiKey: "secret-value",
    pageSize: 20000,
  });

  assert.equal(publicConfig.endpoint, "matrix.local:50051");
  assert.equal(publicConfig.pageSize, 10000);
  assert.equal(publicConfig.hasApiKey, true);
  assert.equal("apiKey" in publicConfig, false);
});

test("endpoint validation rejects addresses without a port", () => {
  assert.throws(() => normalizeEndpoint("matrix.local"), /host:port/);
});

test("stored server endpoints and explicit TLS identity are preserved", async () => {
  const service = new ServerConnectionService(
    memoryStore({ searchServer: { endpoint: "saved-server.example.test:50051", tlsServerName: "saved-tls.example.test", apiKey: "stored-key" } }),
    deviceOptions()
  );

  const config = await service.getResolvedConfig();
  assert.equal(config.endpoint, "saved-server.example.test:50051");
  assert.equal(config.tlsServerName, "saved-tls.example.test");
  assert.equal(service.getPublicConfig().hasApiKey, true);
});

test("a missing trusted CA is rejected before reading a certificate or saving settings", async () => {
  const legacyConfig = { caCertificatePath: "selected.crt" };
  const store = memoryStore({ searchServer: legacyConfig });
  const service = new ServerConnectionService(store, {
    environment: { MATRIX_API_KEY: "configured-key", MATRIX_CA_CERT_PATH: "environment.crt" },
    readCertificate: async () => { throw new Error("unexpected certificate read"); },
  });

  assert.equal(service.getPublicConfig().hasBundledCertificate, false);
  await assert.rejects(service.getResolvedConfig({ caCertificatePath: "other.crt" }), /отсутствует встроенный CA-сертификат/i);
  await assert.rejects(service.updateConfig({ endpoint: "server.example.test:50051", caCertificatePath: "other.crt" }), /отсутствует встроенный CA-сертификат/i);
  assert.equal(store.get("searchServer"), legacyConfig);
});

test("the bundled CA works on a new profile without saving its installation path", async () => {
  const store = memoryStore();
  const certificate = Buffer.from("-----BEGIN CERTIFICATE-----\nbundled-ca\n-----END CERTIFICATE-----\n");
  const service = new ServerConnectionService(store, {
    environment: {},
    bundledCertificatePath: "bundled.crt",
    readCertificate: async (filePath) => {
      assert.equal(filePath, "bundled.crt");
      return certificate;
    },
  });

  assert.equal(service.getPublicConfig().hasBundledCertificate, true);
  const updated = await service.updateConfig({ endpoint: "matrix.local:50051", apiKey: "test-key" });
  assert.equal(Object.hasOwn(updated, "caCertificatePath"), false);
  assert.equal(Object.hasOwn(store.get("searchServer"), "caCertificatePath"), false);
  const resolved = await service.getResolvedConfig();
  assert.equal(resolved.certificatePath, "bundled.crt");
  assert.deepEqual(resolved.caCertificate, certificate);
});

test("the bundled CA cannot be overridden by legacy settings or connection input", async () => {
  const store = memoryStore({ searchServer: { apiKey: "test-key", caCertificatePath: "selected.crt" } });
  const service = new ServerConnectionService(store, {
    environment: {},
    bundledCertificatePath: "bundled.crt",
    readCertificate: async (filePath) => {
      assert.equal(filePath, "bundled.crt");
      return Buffer.from("-----BEGIN CERTIFICATE-----");
    },
  });

  assert.equal((await service.getResolvedConfig()).certificatePath, "bundled.crt");
  const overridden = await service.getResolvedConfig({ caCertificatePath: "other.crt", caCertificate: Buffer.from("other CA") });
  assert.equal(overridden.certificatePath, "bundled.crt");
  assert.equal(overridden.caCertificate.toString(), "-----BEGIN CERTIFICATE-----");
  assert.equal(Object.hasOwn(overridden, "caCertificatePath"), false);
  const updated = await service.updateConfig({ caCertificatePath: "other.crt" });
  assert.equal(Object.hasOwn(updated, "caCertificatePath"), false);
  assert.equal(Object.hasOwn(store.get("searchServer"), "caCertificatePath"), false);
});

test("a protected device key remains usable when a legacy CA path is discarded", async () => {
  const store = memoryStore();
  const options = deviceOptions();
  const legacy = new ServerConnectionService(store, { ...options, bundledCertificatePath: "selected.crt" });
  await legacy.updateConfig({ apiKey: deviceApiKey });
  store.set("searchServer", { ...store.get("searchServer"), caCertificatePath: "selected.crt" });

  const service = new ServerConnectionService(store, options);
  assert.equal((await service.getResolvedConfig()).apiKey, deviceApiKey);
  await service.updateConfig({ pageSize: 100 });
  assert.equal((await service.getResolvedConfig()).apiKey, deviceApiKey);
  assert.equal(Object.hasOwn(store.get("searchServer"), "caCertificatePath"), false);
});

test("resolved configuration keeps explicit, environment and stored API-key precedence", async () => {
  const store = memoryStore({ searchServer: { apiKey: "stored-key", caCertificatePath: "stored.crt", tlsServerName: "stored-name" } });
  const paths = [];
  const service = new ServerConnectionService(store, {
    bundledCertificatePath: "bundled.crt",
    environment: { MATRIX_API_KEY: "environment-key" },
    readCertificate: async (filePath) => { paths.push(filePath); return Buffer.from("-----BEGIN CERTIFICATE-----"); },
  });
  const explicit = await service.getResolvedConfig({ apiKey: "override-key", caCertificatePath: "override.crt", tlsServerName: "override-name" });
  assert.equal(explicit.apiKey, "override-key");
  assert.equal(explicit.tlsServerName, "override-name");
  assert.equal((await service.getResolvedConfig()).apiKey, "environment-key");
  assert.deepEqual(paths, ["bundled.crt", "bundled.crt"]);
  const storedOnly = new ServerConnectionService(store, { ...deviceOptions(), readCertificate: service.readCertificate });
  assert.equal((await storedOnly.getResolvedConfig()).apiKey, "stored-key");
  const updated = await service.updateConfig({ pageSize: 0, connectionTimeoutMs: 999999 });
  assert.equal(updated.pageSize, 50);
  assert.equal(updated.connectionTimeoutMs, 120000);
  assert.equal(store.get("searchServer").tlsServerName, "stored-name");
  assert.equal(store.get("searchServer").apiKey, "stored-key");
  assert.equal("apiKey" in updated, false);
});
