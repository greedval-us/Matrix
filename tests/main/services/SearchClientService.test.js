import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { SearchClientService } from "../../../src/main/services/SearchClientService.js";

class SearchCall extends EventEmitter {
  cancel() {
    this.emit("error", { code: 1, details: "Cancelled" });
  }
}

test("search client streams every server item in bounded renderer chunks", async () => {
  let capturedRequest;
  class BaseSearchClient {
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
  class Metadata { set() {} }
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
  assert.equal(capturedRequest.number, "70000000000");
  assert.deepEqual(chunks, [100, 100, 5]);
  assert.equal(meta.returned_hits, "205");
});
