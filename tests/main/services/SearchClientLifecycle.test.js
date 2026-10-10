import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { SearchClientService } from "../../../src/main/services/SearchClientService.js";

function fixture({ failDatabase = false } = {}) {
  const clients = [];
  const calls = [];
  let resolveConfig;
  const configPromise = new Promise((resolve) => { resolveConfig = resolve; });
  class SearchClient {
    constructor() { this.closed = 0; clients.push(this); }
    waitForReady(_deadline, callback) { callback(); }
    getIndexStatus(_request, _metadata, _options, callback) {
      if (this.failStatus) callback({ details: "status unavailable" });
      else callback(null, { status: "running" });
    }
    streamSearch() {
      const call = new EventEmitter();
      call.cancel = () => { call.cancelled = true; call.emit("error", { code: 1 }); };
      calls.push(call);
      return call;
    }
    close() { this.closed += 1; }
  }
  class DatabaseClient {
    constructor() { if (failDatabase) throw new Error("constructor failure"); this.closed = 0; clients.push(this); }
    close() { this.closed += 1; }
  }
  const service = new SearchClientService({
    connectionService: { getResolvedConfig: () => configPromise },
    dependencies: {
      grpc: { credentials: { createSsl: () => ({}) }, Metadata: class { set() {} }, status: { CANCELLED: 1 } },
      loadProto: (name) => name === "base_search.proto"
        ? { base_search: { BaseSearches: SearchClient } }
        : { database_all: { DatabaseAll: DatabaseClient } },
    },
  });
  return { service, clients, calls, ready() { resolveConfig({ endpoint: "host:50051", apiKey: "secret", pageSize: 1000, connectionTimeoutMs: 1000 }); } };
}

test("simultaneous connects share one pair of transports", async () => {
  const { service, clients, ready } = fixture();
  const first = service.connect();
  const second = service.connect();
  ready();
  assert.deepEqual(await Promise.all([first, second]), [{ status: "running" }, { status: "running" }]);
  assert.equal(clients.length, 2);
  await service.dispose();
  assert.deepEqual(clients.map((client) => client.closed), [1, 1]);
});

test("a failed status refresh keeps an established transport available for retry", async () => {
  const { service, clients, ready } = fixture();
  ready();
  await service.connect();
  clients[0].failStatus = true;
  await assert.rejects(service.connect(), /status unavailable/);
  assert.equal(service.searchClient, clients[0]);
  assert.deepEqual(clients.map((client) => client.closed), [0, 0]);
  clients[0].failStatus = false;
  assert.deepEqual(await service.connect(), { status: "running" });
  await service.dispose();
});

test("dispose invalidates a connection still resolving configuration", async () => {
  const { service, clients, ready } = fixture();
  const pending = service.connect();
  const rejected = assert.rejects(pending, /закрыт/);
  await service.dispose();
  ready();
  await rejected;
  assert.equal(service.searchClient, null);
  assert.ok(clients.every((client) => client.closed === 1));
});

test("partial transport construction is cleaned when the second constructor fails", async () => {
  const { service, clients, ready } = fixture({ failDatabase: true });
  const pending = service.connect();
  ready();
  await assert.rejects(pending, /constructor failure/);
  assert.deepEqual(clients.map((client) => client.closed), [1]);
  assert.equal(service.searchClient, null);
});

test("chunk callback failure rejects search, cancels its stream and permits another search", async () => {
  const { service, calls, ready } = fixture();
  ready();
  const pending = service.search({ number: "123" }, { onChunk() { throw new Error("renderer gone"); } });
  const rejected = assert.rejects(pending, /renderer gone/);
  await new Promise((resolve) => setImmediate(resolve));
  for (let index = 0; index < 100; index += 1) calls[0].emit("data", { object_data: {} });
  await rejected;
  assert.equal(calls[0].cancelled, true);
  assert.equal(service.activeCall, null);
  const next = service.search({ number: "456" });
  await new Promise((resolve) => setImmediate(resolve));
  calls[1].emit("end");
  assert.deepEqual(await next, {});
  await service.dispose();
});

test("callback failure during final partial batch also settles and clears the active stream", async () => {
  const { service, calls, ready } = fixture();
  ready();
  const pending = service.search({ number: "123" }, { onChunk() { throw new Error("final batch failure"); } });
  const rejected = assert.rejects(pending, /final batch failure/);
  await new Promise((resolve) => setImmediate(resolve));
  calls[0].emit("data", { object_data: {} });
  calls[0].emit("end");
  await rejected;
  assert.equal(service.activeCall, null);
  await service.dispose();
});

test("stream failure remains the primary error if delivering buffered results also fails", async () => {
  const { service, calls, ready } = fixture();
  ready();
  const pending = service.search({ number: "123" }, { onChunk() { throw new Error("renderer gone"); } });
  const rejected = assert.rejects(pending, /transport failed/);
  await new Promise((resolve) => setImmediate(resolve));
  calls[0].emit("data", { object_data: {} });
  calls[0].emit("error", { details: "transport failed" });
  await rejected;
  assert.equal(service.activeCall, null);
  await service.dispose();
});

test("cancelling while configuration connects prevents a stream and the client remains reusable", async () => {
  const { service, calls, ready } = fixture();
  const pending = service.search({ number: "70000000000" });
  service.cancel();
  ready();
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(calls.length, 0);
  assert.equal(service.searchPending, false);
  const retry = service.search({ number: "71111111111" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  calls[0].emit("end");
  assert.deepEqual(await retry, {});
  await service.dispose();
});

test("cancelling during a status refresh prevents sending a new search request", async () => {
  const { service, clients, calls, ready } = fixture();
  ready();
  await service.connect();
  let finishStatus;
  clients[0].getIndexStatus = (_request, _metadata, _options, callback) => { finishStatus = callback; };
  const pending = service.search({ number: "70000000000" });
  service.cancel();
  finishStatus(null, { status: "running" });
  assert.deepEqual(await pending, { cancelled: true });
  assert.equal(calls.length, 0);
  await service.dispose();
});

test("a pending connection already owns the search slot and rejects duplicate requests", async () => {
  const { service, calls, ready } = fixture();
  const first = service.search({ number: "70000000000" });
  await assert.rejects(service.search({ number: "71111111111" }), /уже выполняется/);
  service.cancel();
  ready();
  assert.deepEqual(await first, { cancelled: true });
  assert.equal(calls.length, 0);
  await service.dispose();
});
