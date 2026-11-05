import assert from "node:assert/strict";
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

test("server connection config normalizes endpoints and never exposes the API key", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-server-config-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const certificatePath = path.join(directory, "server.crt");
  await fs.writeFile(
    certificatePath,
    "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----\n"
  );
  const service = new ServerConnectionService(memoryStore());
  assert.equal(service.getPublicConfig().endpoint, "localhost:50051");
  assert.equal("bundledCertificatePath" in service.getPublicConfig(), false);
  assert.equal(service.getPublicConfig().connectionTimeoutMs, 30000);

  const publicConfig = await service.updateConfig({
    endpoint: "grpcs://matrix.local:50051/",
    apiKey: "secret-value",
    caCertificatePath: certificatePath,
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
    memoryStore({ searchServer: { endpoint: "saved-server.example.test:50051", tlsServerName: "saved-tls.example.test", apiKey: "stored-key", caCertificatePath: "selected.crt" } }),
    { environment: {}, readCertificate: async () => Buffer.from("-----BEGIN CERTIFICATE-----") }
  );

  const config = await service.getResolvedConfig();
  assert.equal(config.endpoint, "saved-server.example.test:50051");
  assert.equal(config.tlsServerName, "saved-tls.example.test");
  assert.equal(service.getPublicConfig().hasApiKey, true);
});

test("a missing trusted CA is rejected before reading a certificate or saving settings", async () => {
  const store = memoryStore();
  const service = new ServerConnectionService(store, {
    environment: { MATRIX_API_KEY: "configured-key" },
    readCertificate: async () => { throw new Error("unexpected certificate read"); },
  });

  await assert.rejects(service.getResolvedConfig(), /Выберите.*сертификат/i);
  await assert.rejects(service.updateConfig({ endpoint: "server.example.test:50051" }), /Выберите.*сертификат/i);
  assert.equal(store.get("searchServer"), undefined);
});

test("a selected trusted CA uses endpoint TLS verification without a default identity override", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-trusted-ca-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const certificatePath = path.join(directory, "trusted-ca.crt");
  const certificate = Buffer.from("-----BEGIN CERTIFICATE-----\nselected-ca\n-----END CERTIFICATE-----\n");
  await fs.writeFile(certificatePath, certificate);
  const service = new ServerConnectionService(memoryStore(), { environment: { MATRIX_API_KEY: "configured-key" } });

  await service.updateConfig({ caCertificatePath: certificatePath });
  const config = await service.getResolvedConfig();
  assert.equal(config.endpoint, "localhost:50051");
  assert.equal(config.tlsServerName, "");
  assert.equal(config.certificatePath, certificatePath);
  assert.deepEqual(config.caCertificate, certificate);
});

test("resolved configuration keeps explicit, environment and stored API-key precedence", async () => {
  const store = memoryStore({ searchServer: { apiKey: "stored-key", caCertificatePath: "stored.crt", tlsServerName: "stored-name" } });
  const paths = [];
  const service = new ServerConnectionService(store, {
    environment: { MATRIX_API_KEY: "environment-key" },
    readCertificate: async (filePath) => { paths.push(filePath); return Buffer.from("-----BEGIN CERTIFICATE-----"); },
  });
  const explicit = await service.getResolvedConfig({ apiKey: "override-key", caCertificatePath: "override.crt", tlsServerName: "override-name" });
  assert.equal(explicit.apiKey, "override-key");
  assert.equal(explicit.tlsServerName, "override-name");
  assert.equal((await service.getResolvedConfig()).apiKey, "environment-key");
  assert.deepEqual(paths, ["override.crt", "stored.crt"]);
  const storedOnly = new ServerConnectionService(store, { environment: {}, readCertificate: service.readCertificate });
  assert.equal((await storedOnly.getResolvedConfig()).apiKey, "stored-key");
  const updated = await service.updateConfig({ pageSize: 0, connectionTimeoutMs: 999999 });
  assert.equal(updated.pageSize, 50);
  assert.equal(updated.connectionTimeoutMs, 120000);
  assert.equal(store.get("searchServer").tlsServerName, "stored-name");
  assert.equal(store.get("searchServer").apiKey, "stored-key");
  assert.equal("apiKey" in updated, false);
});
