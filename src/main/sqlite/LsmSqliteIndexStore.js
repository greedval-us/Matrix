import fsPromises from "node:fs/promises";
import { INDEXABLE_FIELDS, SQLITE_SEGMENT_MAX_DOCUMENTS } from "../localdb/constants.js";
import { SqliteIndexStore } from "./SqliteIndexStore.js";

const STORAGE_MODE = "lsm-v1";
export const FIELD_STORAGE_MODE = "field-shards-v1";

export class LsmSqliteIndexStore {
  constructor({ paths }) {
    this.paths = paths;
    this.baseStore = new SqliteIndexStore({ paths });
    this.fieldStore = new SqliteIndexStore({
      paths,
      indexesDir: paths.sqliteFieldIndexesDir,
      fieldScoped: true,
    });
    this.segmentStores = new Map();
    this.segmentIds = [];
    this.activeSegmentId = null;
    this.fieldMode = false;
    this.fieldMigration = null;
  }

  async ensureDirectories() {
    await Promise.all([
      this.baseStore.ensureDirectories(),
      ...(this.fieldMode ? [this.fieldStore.ensureDirectories()] : []),
      fsPromises.mkdir(this.paths.sqliteSegmentsDir, { recursive: true }),
    ]);
  }

  configure(state, fieldMigration = null) {
    const storage = state?.storage;
    this.fieldMode = storage?.mode === FIELD_STORAGE_MODE;
    this.segmentIds = storage?.mode === STORAGE_MODE
      ? (storage.segments || []).map((segment) => segment.id)
      : [];
    this.activeSegmentId = storage?.activeSegmentId || null;
    this.fieldMigration = this.validateFieldMigration(state, fieldMigration)
      ? fieldMigration
      : null;
    for (const segmentId of this.segmentIds) this.getSegmentStore(segmentId);
  }

  initializeStorage(state) {
    if ([STORAGE_MODE, FIELD_STORAGE_MODE].includes(state.storage?.mode)) return state.storage;
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
    if (this.fieldMode) return null;
    const storage = this.initializeStorage(state);
    let active = storage.segments.find((segment) => segment.id === storage.activeSegmentId);
    const maxDocuments = storage.segmentMaxDocuments || SQLITE_SEGMENT_MAX_DOCUMENTS;
    if (active && active.indexedDocuments > 0 &&
        active.indexedDocuments + documentCount > maxDocuments) {
      active.status = "sealed";
      this.closeSegmentStore(active.id);
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
    if (this.fieldMode) return this.fieldStore.writeBatch(documents);
    if (!this.activeSegmentId) throw new Error("SQLite LSM write segment is not configured.");
    await this.getSegmentStore(this.activeSegmentId).writeBatch(documents);
  }

  recordWrite(state, documentCount) {
    if (this.fieldMode) return;
    const active = state.storage.segments.find(
      (segment) => segment.id === state.storage.activeSegmentId
    );
    if (!active) throw new Error("SQLite LSM active segment is missing from state.");
    active.indexedDocuments += documentCount;
    active.updatedAt = new Date().toISOString();
  }

  queryField(field, term, limit, options = {}) {
    if (this.fieldMode) return this.fieldStore.queryField(field, term, limit, options);
    if (this.fieldMigration) {
      return this.fieldStore.queryField(field, term, limit, {
        ...options,
        wildcardReady: false,
      });
    }
    return this.queryStores(this.readStoresNewestFirst(), field, term, limit, options);
  }

  queryStores(stores, field, term, limit, options) {
    const results = [];
    const seen = new Set();
    for (const store of stores) {
      if (results.length >= limit) break;
      for (const key of store.queryField(field, term, limit - results.length, options)) {
        const hex = Buffer.from(key).toString("hex");
        if (seen.has(hex)) continue;
        seen.add(hex);
        results.push(key);
      }
    }
    return results;
  }

  loadDocumentPointers(docKeys) {
    if (this.fieldMode) return this.fieldStore.loadDocumentPointers(docKeys);
    if (this.fieldMigration) return this.fieldStore.loadDocumentPointers(docKeys);
    return this.loadDocumentPointersFromStores(docKeys, this.readStoresNewestFirst());
  }

  loadDocumentPointersFromStores(docKeys, stores) {
    const remaining = new Map(docKeys.map((key) => [Buffer.from(key).toString("hex"), key]));
    const pointers = new Map();
    for (const store of stores) {
      if (remaining.size === 0) break;
      for (const pointer of store.loadDocumentPointers([...remaining.values()])) {
        const hex = Buffer.from(pointer.doc_key).toString("hex");
        pointers.set(hex, pointer);
        remaining.delete(hex);
      }
    }
    return docKeys.map((key) => pointers.get(Buffer.from(key).toString("hex"))).filter(Boolean);
  }

  validateFieldMigration(state, migration) {
    if (this.fieldMode || state?.storage?.mode !== STORAGE_MODE ||
        migration?.version !== 2 || migration?.order !== "target-shard-major") {
      return false;
    }
    const sourceIds = [...this.segmentIds].reverse().concat("base");
    return migration.indexedDocuments === state.indexedDocuments &&
      JSON.stringify(migration.sourceIds) === JSON.stringify(sourceIds);
  }

  keyHex(value) {
    return Buffer.from(value).toString("hex");
  }

  getWildcardTargets() {
    if (this.fieldMode) return INDEXABLE_FIELDS;
    return ["base", ...this.segmentIds];
  }

  rebuildWildcardShard(shard, target = "base") {
    if (this.fieldMode) return this.fieldStore.rebuildWildcardShard(shard, target);
    return (target === "base" ? this.baseStore : this.getSegmentStore(target))
      .rebuildWildcardShard(shard);
  }

  close() {
    this.baseStore.close();
    this.fieldStore.close();
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

  closeSegmentStore(segmentId) {
    const store = this.segmentStores.get(segmentId);
    if (!store) return;
    store.close();
    this.segmentStores.delete(segmentId);
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
