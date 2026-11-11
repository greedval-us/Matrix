import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { grpc, loadProto as loadRealProto } from "../../../src/main/utils/grpcLoader.js";

import {
  grpcError,
  SearchClientService,
} from "../../../src/main/services/SearchClientService.js";

class SearchCall extends EventEmitter {
  cancel() {
    this.emit("error", { code: 1, details: "Cancelled" });
  }
}

test("search client streams every server item in bounded renderer chunks", async () => {
  let capturedRequest;
  let capturedEndpoint;
  let capturedOptions;
  let capturedApiKey;
  class BaseSearchClient {
    constructor(endpoint, _credentials, options) {
      capturedEndpoint = endpoint;
      capturedOptions = options;
    }
    waitForReady(_deadline, callback) { callback(); }
    getIndexStatus(_request, _metadata, _options, callback) {
      callback(null, { status: "running", indexed_shards: 10, total_shards: 128 });
    }
    streamSearch(request) {
      capturedRequest = request;
      const call = new SearchCall();
      queueMicrotask(() => {
        for (let index = 0; index < 205; index += 1) {
          call.emit("data", { object_data: { source_name: "number_mail", fields: {} } });
        }
        call.emit("data", { meta: { total_hits: "205", returned_hits: "205" } });
        call.emit("end");
      });
      return call;
    }
    close() {}
  }
  class DatabaseClient { close() {} }
  class Metadata { set(name, value) { if (name === 'x-api-key') capturedApiKey = value; } }
  const fakeGrpc = {
    credentials: { createSsl: () => ({}) },
    Metadata,
    status: { CANCELLED: 1 },
  };
  const loadProto = (name) => name === "base_search.proto"
    ? { base_search: { BaseSearches: BaseSearchClient } }
    : { database_all: { DatabaseAll: DatabaseClient } };
  const connectionService = {
    getResolvedConfig: async () => ({
      endpoint: "matrix.local:50051",
      tlsServerName: "server.example.test",
      apiKey: "secret",
      caCertificate: Buffer.from("certificate"),
      pageSize: 1000,
      connectionTimeoutMs: 1000,
    }),
  };
  const service = new SearchClientService({
    connectionService,
    dependencies: { grpc: fakeGrpc, loadProto },
  });
  const chunks = [];

  const meta = await service.search(
    { number: "70000000000" },
    { onChunk: (items) => chunks.push(items.length) }
  );

  assert.equal(capturedRequest.limit, 1000);
  assert.equal(capturedEndpoint, "matrix.local:50051");
  assert.equal(capturedOptions["grpc.ssl_target_name_override"], "server.example.test");
  assert.equal(capturedOptions["grpc.default_authority"], "server.example.test");
  assert.equal(capturedOptions["grpc.keepalive_time_ms"], 60000);
  assert.equal(capturedOptions["grpc.keepalive_timeout_ms"], 10000);
  assert.equal(capturedOptions["grpc.max_receive_message_length"], 33554432);
  assert.equal(capturedApiKey, "secret");
  assert.equal(capturedRequest.number, "70000000000");
  assert.deepEqual(chunks, [100, 100, 5]);
  assert.equal(meta.returned_hits, "205");

  await service.search({ number: "70000000000", limit: 10000 });
  assert.equal(capturedRequest.limit, 10000);
  await service.search({ number: "70000000000", limit: 50 });
  assert.equal(capturedRequest.limit, 50);
  for (const limit of [0, 49, 10001, 1000.5, "10000", null, NaN, Infinity]) {
    await assert.rejects(service.search({ number: "70000000000", limit }), /Лимит поиска/);
    assert.equal(capturedRequest.limit, 50, "invalid limits never reach streamSearch");
  }
  await service.search({ number: "70000000000" });
  assert.equal(capturedRequest.limit, 1000, "a report request does not change the configured default");
  await service.dispose();
});

test("connection deadline errors are explained to the user", () => {
  assert.match(grpcError({ code: 4 }).message, /Не удалось подключиться/);
});

test("device proofs use the generated method path for status, search, and catalog", async () => {
  const paths = [];
  const received = [];
  const apiKey = `mxk_${"A".repeat(43)}`;
  class BaseSearchClient {
    waitForReady(_deadline, callback) { callback(); }
    getIndexStatus(_request, metadata, _options, callback) {
      received.push(metadata.get("x-api-key")[0]);
      callback(null, { status: "completed" });
    }
    streamSearch(_request, metadata) {
      received.push(metadata.get("x-api-key")[0]);
      const call = new SearchCall();
      queueMicrotask(() => call.emit("end"));
      return call;
    }
    close() {}
  }
  class DatabaseClient {
    streamDatabaseAll(_request, metadata) {
      received.push(metadata.get("x-api-key")[0]);
      const call = new SearchCall();
      queueMicrotask(() => call.emit("end"));
      return call;
    }
    close() {}
  }
  const Search = loadRealProto("base_search.proto").base_search.BaseSearches;
  const Database = loadRealProto("database_all.proto").database_all.DatabaseAll;
  for (const method of ["getIndexStatus", "streamSearch"]) BaseSearchClient.prototype[method].path = Search.prototype[method].path;
  DatabaseClient.prototype.streamDatabaseAll.path = Database.prototype.streamDatabaseAll.path;
  const service = new SearchClientService({
    connectionService: {
      getResolvedConfig: async () => ({
        apiKey, endpoint: "matrix.local:50051", pageSize: 1000, connectionTimeoutMs: 1000,
        signDeviceRequest(methodPath) { paths.push(methodPath); return { "x-matrix-device-nonce": `proof-${paths.length}` }; },
      }),
    },
    dependencies: {
      grpc: { ...grpc, credentials: { createSsl: () => ({}) } },
      loadProto: name => name === "base_search.proto"
        ? { base_search: { BaseSearches: BaseSearchClient } }
        : { database_all: { DatabaseAll: DatabaseClient } },
    },
  });
  try {
    await service.search({ number: "70000000000" });
    await service.listDatabases();
    await service.getIndexStatus();
  } finally { await service.dispose(); }
  assert.deepEqual(paths, [
    Search.prototype.getIndexStatus.path, Search.prototype.streamSearch.path,
    Search.prototype.getIndexStatus.path, Database.prototype.streamDatabaseAll.path,
    Search.prototype.getIndexStatus.path,
  ]);
  assert.deepEqual(received, Array(5).fill(apiKey));
});

test("an already activated device key has a distinct connection error", () => {
  assert.match(grpcError({ code: grpc.status.PERMISSION_DENIED, details: "API key is already bound to another device" }).message,
    /ключ.*привязан.*другому компьютеру/i);
  assert.doesNotMatch(grpcError({ code: grpc.status.PERMISSION_DENIED, details: "Other issue" }).message, /другому компьютеру/i);
});
