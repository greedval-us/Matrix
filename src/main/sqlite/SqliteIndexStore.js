import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  INDEXABLE_FIELDS,
  SQLITE_DOCUMENT_SHARD_COUNT,
  SQLITE_TERM_SHARD_COUNT,
  SQLITE_WILDCARD_MIN_LITERAL_LENGTH,
} from "../localdb/constants.js";

const FIELD_IDS = new Map(INDEXABLE_FIELDS.map((field, index) => [field, index + 1]));

export class SqliteIndexStore {
  constructor({ paths, maxOpenConnections = 160 }) {
    this.paths = paths;
    this.maxOpenConnections = maxOpenConnections;
    this.connections = new Map();
    this.readonlyDatabases = new WeakSet();
  }

  async ensureDirectories() {
    await Promise.all([
      fsPromises.mkdir(this.paths.sqliteTermIndexesDir, { recursive: true }),
      fsPromises.mkdir(path.join(this.paths.sqliteIndexesDir, "documents"), { recursive: true }),
    ]);
  }

  hash(value) {
    return createHash("md5").update(String(value), "utf8").digest();
  }

  getTermShard(field, term) {
    return (this.hash(`${field}:${term}`)[0] % SQLITE_TERM_SHARD_COUNT)
      .toString(16)
      .padStart(2, "0");
  }

  getDocumentShard(docKey) {
    return (docKey[0] % SQLITE_DOCUMENT_SHARD_COUNT).toString(16).padStart(2, "0");
  }

  async writeBatch(documents) {
    await this.ensureDirectories();
    const documentGroups = new Map();
    const postingGroups = new Map();

    for (const document of documents) {
      const docKey = this.hash(document.docId);
      const documentShard = this.getDocumentShard(docKey);
      const documentEntries = documentGroups.get(documentShard) || [];
      documentEntries.push({ ...document, docKey });
      documentGroups.set(documentShard, documentEntries);

      for (const [field, terms] of Object.entries(document.indexTerms || {})) {
        for (const term of terms) {
          const shard = this.getTermShard(field, term);
          const postings = postingGroups.get(shard) || [];
          postings.push({ fieldId: this.getFieldId(field), term, docKey });
          postingGroups.set(shard, postings);
        }
      }
    }

    for (const [shard, entries] of documentGroups.entries()) {
      const database = this.openDocumentShard(shard);
      const insert = database.prepare(`
        INSERT OR IGNORE INTO documents
          (doc_key, doc_id, file_name, byte_offset, byte_length, source_table)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      this.transaction(database, () => {
        for (const item of entries) {
          insert.run(
            item.docKey,
            item.docId,
            item.fileName,
            item.byteOffset,
            item.byteLength,
            item.sourceTable || ""
          );
        }
      });
    }

    for (const [shard, postings] of postingGroups.entries()) {
      const database = this.openTermShard(shard);
      const insertPosting = database.prepare(
        "INSERT OR IGNORE INTO postings(field_id, term, doc_key) VALUES (?, ?, ?)"
      );
      this.transaction(database, () => {
        for (const { fieldId, term, docKey } of postings) {
          insertPosting.run(fieldId, term, docKey);
        }
      });
    }
  }

  queryField(field, term, limit, { wildcardReady = true } = {}) {
    if (!term.includes("%") && !term.includes("?")) {
      return this.queryExact(field, term, limit);
    }
    return this.queryWildcard(field, term, limit, wildcardReady);
  }

  queryExact(field, term, limit) {
    const fieldId = this.getFieldId(field);
    const shard = this.getTermShard(field, term);
    const database = this.openExistingTermShard(shard);
    if (!database) return [];
    return database.prepare(`
      SELECT doc_key
      FROM postings
      WHERE field_id = ? AND term = ?
      LIMIT ?
    `).all(fieldId, term, limit).map((row) => row.doc_key);
  }

  queryWildcard(field, term, limit, wildcardReady) {
    const fieldId = this.getFieldId(field);
    const sqlPattern = term.replace(/\?/g, "_");
    const prefix = term.match(/^[^%?]+/u)?.[0] || "";
    const longestLiteral = term
      .split(/[%?]+/u)
      .reduce((longest, value) => value.length > longest.length ? value : longest, "");
    if (longestLiteral.length < SQLITE_WILDCARD_MIN_LITERAL_LENGTH) {
      throw new Error(
        `Wildcard search requires at least ${SQLITE_WILDCARD_MIN_LITERAL_LENGTH} consecutive characters.`
      );
    }
    if (!prefix && !wildcardReady) {
      throw new Error("Wildcard indexes are not ready. Run SQLite wildcard indexing first.");
    }

    const results = [];
    for (let shardIndex = 0; shardIndex < SQLITE_TERM_SHARD_COUNT; shardIndex += 1) {
      if (results.length >= limit) break;
      const shard = shardIndex.toString(16).padStart(2, "0");
      const database = this.openExistingTermShard(shard);
      if (!database) continue;
      const remaining = limit - results.length;
      const rows = prefix
        ? database.prepare(`
            SELECT doc_key
            FROM postings
            WHERE field_id = ? AND term LIKE ?
            LIMIT ?
          `).all(fieldId, sqlPattern, remaining)
        : database.prepare(`
            SELECT p.doc_key
            FROM terms_fts f
            JOIN postings p ON p.field_id = f.field_id AND p.term = f.term
            WHERE f.field_id = ? AND f.term LIKE ?
            LIMIT ?
          `).all(fieldId, sqlPattern, remaining);
      results.push(...rows.map((row) => row.doc_key));
    }
    return results;
  }

  rebuildWildcardShard(shard) {
    const database = this.openExistingTermShard(shard, false);
    if (!database) return false;
    this.transaction(database, () => {
      database.exec(`
        DROP TABLE IF EXISTS terms_fts;
        CREATE VIRTUAL TABLE terms_fts USING fts5(
          field_id UNINDEXED,
          term,
          tokenize='trigram',
          detail='none',
          columnsize=0
        );
        INSERT INTO terms_fts(field_id, term)
        SELECT DISTINCT field_id, term FROM postings;
      `);
    });
    database.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    return true;
  }

  loadDocumentPointers(docKeys) {
    const groups = new Map();
    for (const docKey of docKeys) {
      const shard = this.getDocumentShard(docKey);
      const values = groups.get(shard) || [];
      values.push(docKey);
      groups.set(shard, values);
    }

    const pointers = new Map();
    for (const [shard, keys] of groups.entries()) {
      const database = this.openExistingDocumentShard(shard);
      if (!database) continue;
      const placeholders = keys.map(() => "?").join(",");
      const rows = database.prepare(`
        SELECT doc_key, doc_id, file_name, byte_offset, byte_length, source_table
        FROM documents
        WHERE doc_key IN (${placeholders})
      `).all(...keys);
      for (const row of rows) pointers.set(this.keyHex(row.doc_key), row);
    }
    return docKeys.map((key) => pointers.get(this.keyHex(key))).filter(Boolean);
  }

  openTermShard(shard) {
    return this.open(this.paths.getSqliteTermShardPath(shard), "term", false);
  }

  openDocumentShard(shard) {
    return this.open(this.paths.getSqliteDocumentShardPath(shard), "document", false);
  }

  openExistingTermShard(shard, readonly = true) {
    const filePath = this.paths.getSqliteTermShardPath(shard);
    return fs.existsSync(filePath) ? this.open(filePath, "term", readonly) : null;
  }

  openExistingDocumentShard(shard) {
    const filePath = this.paths.getSqliteDocumentShardPath(shard);
    return fs.existsSync(filePath) ? this.open(filePath, "document", true) : null;
  }

  open(filePath, kind, readonly) {
    const cacheKey = `${readonly ? "r" : "w"}:${filePath}`;
    const cached = this.connections.get(cacheKey);
    if (cached) {
      this.connections.delete(cacheKey);
      this.connections.set(cacheKey, cached);
      return cached;
    }
    if (!readonly) fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath, { readOnly: readonly });
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("PRAGMA case_sensitive_like = ON");
    database.exec("PRAGMA cache_size = -8192");
    if (!readonly) {
      database.exec("PRAGMA journal_mode = WAL");
      database.exec("PRAGMA synchronous = FULL");
      database.exec("PRAGMA wal_autocheckpoint = 16384");
      kind === "term"
        ? this.initializeTermSchema(database)
        : this.initializeDocumentSchema(database);
    } else {
      this.readonlyDatabases.add(database);
    }
    this.connections.set(cacheKey, database);
    this.evictConnections();
    return database;
  }

  initializeTermSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS postings (
        field_id INTEGER NOT NULL,
        term TEXT NOT NULL,
        doc_key BLOB NOT NULL,
        PRIMARY KEY (field_id, term, doc_key)
      ) WITHOUT ROWID;
    `);
  }

  getFieldId(field) {
    const fieldId = FIELD_IDS.get(field);
    if (!fieldId) throw new Error(`Unsupported SQLite index field: ${field}`);
    return fieldId;
  }

  initializeDocumentSchema(database) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        doc_key BLOB PRIMARY KEY,
        doc_id TEXT NOT NULL,
        file_name TEXT NOT NULL,
        byte_offset INTEGER NOT NULL,
        byte_length INTEGER NOT NULL,
        source_table TEXT NOT NULL
      ) WITHOUT ROWID;
    `);
  }

  evictConnections() {
    while (this.connections.size > this.maxOpenConnections) {
      const [key, database] = this.connections.entries().next().value;
      this.closeDatabase(database);
      this.connections.delete(key);
    }
  }

  closeDatabase(database) {
    if (!this.readonlyDatabases.has(database)) {
      try { database.exec("PRAGMA wal_checkpoint(TRUNCATE)"); } catch {}
    }
    database.close();
  }

  close() {
    for (const database of this.connections.values()) this.closeDatabase(database);
    this.connections.clear();
  }

  transaction(database, callback) {
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  keyHex(value) {
    return Buffer.from(value).toString("hex");
  }
}
