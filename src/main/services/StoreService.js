import Store from "electron-store";
import { randomUUID } from "node:crypto";
import { RENDERER_COLLECTION_KEYS } from "./rendererStorePolicy.js";

const COLLECTION_SCHEMA = Object.fromEntries(RENDERER_COLLECTION_KEYS.map((key) => [key, { type: "array", default: [] }]));
const timestamp = () => new Date().toISOString();

export class StoreService {
  constructor(schema = {}, { store } = {}) {
    this.store = store || new Store({ schema: { ...COLLECTION_SCHEMA, ...schema } });
  }

  get(key) { return this.store.get(key); }
  set(key, value) { this.store.set(key, value); }
  delete(key) { this.store.delete(key); }
  has(key) { return this.store.has(key); }
  clear() { this.store.clear(); }

  collection(key) { return this.store.get(key) || []; }

  updateCollection(key, transform) {
    this.store.set(key, transform(this.collection(key)));
    return true;
  }

  addCollectionItem(key, data, { prepend = false } = {}) {
    const item = { id: randomUUID(), ...data, createdAt: timestamp() };
    this.updateCollection(key, (items) => prepend ? [item, ...items] : [...items, item]);
    return item;
  }

  updateCollectionItem(key, id, transform) {
    return this.updateCollection(key, (items) => items.map((item) =>
      item.id === id ? { ...transform(item), updatedAt: timestamp() } : item));
  }

  deleteCollectionItem(key, id) {
    return this.updateCollection(key, (items) => items.filter((item) => item.id !== id));
  }

  getNotes() { return this.collection("notes"); }
  addNote(text) { return this.addCollectionItem("notes", { text }); }
  updateNote(id, text) { return this.updateCollectionItem("notes", id, (note) => ({ ...note, text })); }
  deleteNote(id) { return this.deleteCollectionItem("notes", id); }

  getTasks() { return this.collection("tasks"); }
  addTask(title, text = "") { return this.addCollectionItem("tasks", { title, text, done: false }); }
  updateTask(id, title, text) {
    return this.updateCollectionItem("tasks", id, (task) => ({ ...task, title: title ?? task.title, text: text ?? task.text }));
  }
  toggleTaskDone(id) { return this.updateCollectionItem("tasks", id, (task) => ({ ...task, done: !task.done })); }
  deleteTask(id) { return this.deleteCollectionItem("tasks", id); }

  getHistory() { return this.collection("history"); }
  addHistoryItem(key, value) { return this.addCollectionItem("history", { key, value }, { prepend: true }); }
  deleteHistoryItem(id) { return this.deleteCollectionItem("history", id); }
  clearHistory() { return this.updateCollection("history", () => []); }
}
