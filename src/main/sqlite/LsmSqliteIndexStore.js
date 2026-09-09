import fsPromises from "node:fs/promises";
import { SQLITE_SEGMENT_MAX_DOCUMENTS } from "../localdb/constants.js";
import { SqliteIndexStore } from "./SqliteIndexStore.js";

const STORAGE_MODE = "lsm-v1";

export class LsmSqliteIndexStore {
  constructor({ paths }) {
    this.paths = paths;
    this.baseStore = new SqliteIndexStore({ paths });
    this.segmentStores = new Map();
    this.segmentIds = [];
    this.activeSegmentId = null;
  }

  async ensureDirectories() {
    await Promise.all([
      this.baseStore.ensureDirectories(),
      fsPromises.mkdir(this.paths.sqliteSegmentsDir, { recursive: true }),
    ]);
  }

  configure(state) {
    const storage = state?.storage;
    this.segmentIds = storage?.mode === STORAGE_MODE
      ? (storage.segments || []).map((segment) => segment.id)
      : [];
    this.activeSegmentId = storage?.activeSegmentId || null;
    for (const segmentId of this.segmentIds) this.getSegmentStore(segmentId);
  }

  initializeStorage(state) {
    if (state.storage?.mode === STORAGE_MODE) return state.storage;
    state.storage = {
      mode: STORAGE_MODE,
      baseIndexedDocuments: Number(state.indexedDocuments) || 0,
      segmentMaxDocuments: SQLITE_SEGMENT_MAX_DOCUMENTS,
      activeSegmentId: null,
      segments: [],
    };
    this.configure(state);
    return state.storage;
  }

  prepareWrite(state, documentCount) {
    const storage = this.initializeStorage(state);
    let active = storage.segments.find((segment) => segment.id === storage.activeSegmentId);
    const maxDocuments = storage.segmentMaxDocuments || SQLITE_SEGMENT_MAX_DOCUMENTS;
    if (active && active.indexedDocuments > 0 &&
        active.indexedDocuments + documentCount > maxDocuments) {
      active.status = "sealed";
      active = null;
      storage.activeSegmentId = null;
    }
    if (!active) {
      const id = this.nextSegmentId(storage.segments);
      active = {
        id,
        status: "active",
        indexedDocuments: 0,
        startIndexedDocuments: Number(state.indexedDocuments) || 0,
        createdAt: new Date().toISOString(),
      };
      storage.segments.push(active);
      storage.activeSegmentId = id;
      this.segmentIds.push(id);
    }
    this.activeSegmentId = active.id;
    return active;
  }

  async writeBatch(documents) {
    if (!this.activeSegmentId) throw new Error("SQLite LSM write segment is not configured.");
    await this.getSegmentStore(this.activeSegmentId).writeBatch(documents);
  }

  recordWrite(state, documentCount) {
    const active = state.storage.segments.find(
      (segment) => segment.id === state.storage.activeSegmentId
    );
    if (!active) throw new Error("SQLite LSM active segment is missing from state.");
    active.indexedDocuments += documentCount;
    active.updatedAt = new Date().toISOString();
  }

  queryField(field, term, limit, options = {}) {
    const results = [];
    const seen = new Set();
    for (const store of this.readStoresNewestFirst()) {
      if (results.length >= limit) break;
      const matches = store.queryField(field, term, limit - results.length, options);
      for (const key of matches) {
        const hex = Buffer.from(key).toString("hex");
        if (seen.has(hex)) continue;
        seen.add(hex);
        results.push(key);
      }
    }
    return results;
  }

  loadDocumentPointers(docKeys) {
    const remaining = new Map(docKeys.map((key) => [Buffer.from(key).toString("hex"), key]));
    const pointers = new Map();
    for (const store of this.readStoresNewestFirst()) {
      if (remaining.size === 0) break;
      for (const pointer of store.loadDocumentPointers([...remaining.values()])) {
        const hex = Buffer.from(pointer.doc_key).toString("hex");
        pointers.set(hex, pointer);
        remaining.delete(hex);
      }
    }
    return docKeys.map((key) => pointers.get(Buffer.from(key).toString("hex"))).filter(Boolean);
  }

  getWildcardTargets() {
    return ["base", ...this.segmentIds];
  }

  rebuildWildcardShard(shard, target = "base") {
    return (target === "base" ? this.baseStore : this.getSegmentStore(target))
      .rebuildWildcardShard(shard);
  }

  close() {
    this.baseStore.close();
    for (const store of this.segmentStores.values()) store.close();
    this.segmentStores.clear();
  }

  getSegmentStore(segmentId) {
    let store = this.segmentStores.get(segmentId);
    if (!store) {
      store = new SqliteIndexStore({
        paths: this.paths,
        indexesDir: this.paths.getSqliteSegmentDir(segmentId),
      });
      this.segmentStores.set(segmentId, store);
    }
    return store;
  }

  readStoresNewestFirst() {
    return [
      ...[...this.segmentIds].reverse().map((id) => this.getSegmentStore(id)),
      this.baseStore,
    ];
  }

  nextSegmentId(segments) {
    const next = segments.reduce((maximum, segment) => {
      const match = segment.id.match(/^segment-(\d+)$/u);
      return Math.max(maximum, Number(match?.[1]) || 0);
    }, 0) + 1;
    return `segment-${String(next).padStart(6, "0")}`;
  }
}
