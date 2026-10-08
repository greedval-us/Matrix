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
  assert.equal(service.getPublicConfig().endpoint, "192.168.1.46:50051");
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

test("legacy default hostname migrates to the LAN address without changing custom endpoints", () => {
  const legacyService = new ServerConnectionService(
    memoryStore({ searchServer: { endpoint: "arm-5:50051", apiKey: "secret" } })
  );
  const customService = new ServerConnectionService(
    memoryStore({ searchServer: { endpoint: "matrix.local:50051" } })
  );

  assert.equal(legacyService.getPublicConfig().endpoint, "192.168.1.46:50051");
  assert.equal(legacyService.getPublicConfig().hasApiKey, true);
  assert.equal(customService.getPublicConfig().endpoint, "matrix.local:50051");
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
