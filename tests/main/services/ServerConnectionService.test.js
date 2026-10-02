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
