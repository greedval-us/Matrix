import assert from "node:assert/strict";
import test from "node:test";
import { StoreService } from "../../../src/main/services/StoreService.js";
import { StoreHandler } from "../../../src/main/ipc/StoreHandler.js";
import { IPC_CHANNELS } from "../../../src/shared/constants/ipcChannels.js";

function memoryStore() {
  const values = new Map([["notes", []], ["tasks", []], ["history", []], ["searchServer", { apiKey: "private" }]]);
  return { get: (key) => values.get(key), set: (key, value) => values.set(key, value), delete: (key) => values.delete(key), has: (key) => values.has(key), clear: () => values.clear() };
}

test("collection updates preserve task state, note timestamps and newest-first history", () => {
  const service = new StoreService({}, { store: memoryStore() });
  const note = service.addNote("first");
  const task = service.addTask("title", "details");
  service.updateNote(note.id, "updated");
  service.toggleTaskDone(task.id);
  service.updateTask(task.id, "changed");
  service.addHistoryItem("number", "123");
  const latest = service.addHistoryItem("mail", "a@b.c");
  assert.equal(service.getNotes()[0].text, "updated");
  assert.ok(service.getNotes()[0].updatedAt);
  assert.equal(service.getTasks()[0].done, true);
  assert.equal(service.getTasks()[0].title, "changed");
  assert.equal(service.getTasks()[0].text, "details");
  assert.equal(service.getHistory()[0].id, latest.id);
  service.deleteNote(note.id);
  service.deleteTask(task.id);
  service.deleteHistoryItem(latest.id);
  assert.deepEqual(service.getNotes(), []);
  assert.deepEqual(service.getTasks(), []);
  assert.equal(service.getHistory().length, 1);
});

test("renderer store handlers reject protected keys and clear only user collections", () => {
  const store = memoryStore();
  store.set("theme", "dark");
  const handlers = new Map();
  const ipc = { handle: (name, handler) => handlers.set(name, handler), removeHandler: (name) => handlers.delete(name) };
  const handler = new StoreHandler(store, { ipc, wrap: (_channel, operation) => operation });
  handler.register();
  assert.throws(() => handlers.get(IPC_CHANNELS.store.get)({}, "searchServer.apiKey"), /недоступ/);
  assert.throws(() => handlers.get(IPC_CHANNELS.store.set)({}, { key: "searchServer", value: {} }), /недоступ/);
  assert.throws(() => handlers.get(IPC_CHANNELS.store.delete)({}, "searchServer"), /недоступ/);
  handlers.get(IPC_CHANNELS.store.clear)({});
  assert.deepEqual(store.get("searchServer"), { apiKey: "private" });
  assert.equal(store.get("theme"), "dark");
  assert.deepEqual(store.get("notes"), []);
  handler.shutdown();
  assert.equal(handlers.size, 0);
});
