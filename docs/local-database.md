# Local Database Guide

This document describes the current local database architecture in `Matrix`, the operational commands, and the rules that should be kept stable so the project does not drift into an unsupported state.

## 1. Goal

The local database is designed for a very large offline dataset where:

- source data can be hundreds of gigabytes
- document files can be split into multiple large JSONL segments
- indexing must be resumable
- search must remain usable during a long rebuild
- future optimizations should not require rewriting the whole storage model

## 2. Current Storage Layout

Database root example:

```text
MatrixData/
  documents/
  indexes/
  meta/
  state/
  temp/
  README.txt
```

### 2.1 `documents/`

Contains imported JSONL document segments.

Rules:

- each line is one full stored document
- files may be split by size
- current operational target is usually `1-2 GB` per file
- file names are stable import segment names such as:

```text
documents/
  1con_1_part_0001.jsonl
  1con_1_part_0002.jsonl
  vk_2_part_0101.jsonl
```

Document example:

```json
{
  "docId": "1con_1:635420",
  "sourceTable": "1con_1",
  "rowId": 635420,
  "importedAt": "2026-07-20T09:45:05.035Z",
  "fields": {
    "fio": "ИВАНОВ ИВАН ИВАНОВИЧ",
    "number": "70000000000"
  },
  "invalidFields": {},
  "raw": {}
}
```

### 2.2 `indexes/<field>/`

Contains field indexes.

Examples:

```text
indexes/
  number/
  mail/
  fio/
  passport/
```

Current field bucket storage is tree-based, not flat. Bucket files with names longer than
2 characters are stored under a subdirectory derived from the first 2 bucket characters.

Examples:

```text
indexes/number/79/7999~6a.jsonl
indexes/mail/te/test~f.jsonl
indexes/fio/ИВ/ИВАН.jsonl
```

Each line in a field bucket stores only the search relation:

```json
{"term":"70000000000","docId":"1con_1:635420","sourceTable":"1con_1","rowId":635420}
```

Important:

- field indexes do **not** store `fileName`
- field indexes answer only: "which `docId` matches this term?"

### 2.3 `indexes/_documents/`

Contains compact lookup entries from `docId` to the real document position in `documents/`.

Current format:

- `lookupFormatVersion = 6`
- document lookup bucket name = first `3` hex chars of `md5(docId)`
- stored as a tree, not a flat directory
- path shape:

```text
indexes/_documents/ab/abc.jsonl
```

Lookup line example:

```json
{"docId":"1con_1:635420","fileName":"1con_1_part_0001.jsonl","byteOffset":123456,"byteLength":789}
```

Why this matters:

- `_documents` is more heavily sharded than before
- shards are distributed across subdirectories, so we do not create thousands of files in one directory
- lookup files can contain entries for many different `documents/*.jsonl` files
- grouping is by hash bucket, not by source file name

### 2.4 `meta/`

Important files:

```text
meta/
  db.json
  sources.json
  index_bucket_stats.json
```

`db.json` stores:

- storage format version
- active field list
- current bucket layout version
- current lookup format version

`sources.json` stores source metadata shown in UI.

`index_bucket_stats.json` stores lightweight sidecar stats collected during indexing:

- document counts per field bucket
- document counts per `_documents` bucket
- used by search ordering and diagnostics

### 2.5 `state/`

Important files:

```text
state/
  import_state.json
  index_state.json
```

`index_state.json` is critical during rebuild:

- resumable session state
- current file progress
- current active bucket layouts
- current lookup format version

During an active rebuild, search may use `index_state.json` if `db.json` still contains old metadata.

### 2.6 `temp/`

Used for:

- in-progress index builds
- backup swap directories
- resumable interrupted work

`temp/` may be safely cleaned only when indexing is stopped and you intentionally want to discard the active build.

## 3. Search Flow

Search is intentionally two-stage:

1. field index lookup
2. document lookup

Example for number search:

1. Search term `70000000000` goes to `indexes/number/...`
2. Matching field index lines return `docId`
3. For each `docId`, search goes to `_documents`
4. `_documents` returns `fileName + byteOffset + byteLength`
5. Search reads the exact document chunk from `documents/*.jsonl`

This is why field indexes do not need `fileName`.

## 4. Search During Rebuild

Search during indexing is supported with limitations.

Rules:

- published index parts become searchable after file commits
- results are partial until rebuild is complete
- search uses `index_state.json` bucket layouts while rebuild is `running`
- this avoids mismatches when `meta/db.json` still has old layout info

Operational meaning:

- the app may search while rebuild is running
- results only include already published files
- if the first file is not committed yet, results may still be empty

## 5. Bucket Strategy

### 5.1 Field indexes

Current recommended layout is version `3` for dense fields and version `2` for lighter fields.

Important current layouts:

- `number`: `4-char prefix + 2-char md5 hash suffix`
- `mail`: `4-char prefix + 1-char md5 hash suffix`
- `passport`: `4-char prefix + 1-char md5 hash suffix`
- `inn`: `4-char prefix + 1-char md5 hash suffix`
- `snils`: `4-char prefix + 1-char md5 hash suffix`
- `telegram`: `4-char prefix + 1-char md5 hash suffix`
- `vk`: `4-char prefix + 1-char md5 hash suffix`
- `facebook`: `4-char prefix + 1-char md5 hash suffix`
- `date_of_birth`: `4-char prefix + 1-char md5 hash suffix`
- `fio`: `4-char prefix + 1-char md5 hash suffix`
- `grz`, `vin`, and most other fields: `3-char prefix`

Reason:

- dense exact-match fields need both prefix sharding and hash sub-buckets
- this prevents a few hot prefixes from growing into giant files again
- wildcard-capable fields such as `fio` still resolve by prefix during search, but exact bucket files
  are additionally hash-sharded to avoid huge hot-name files
- field buckets are also split into subdirectories, so one field directory does not accumulate
  tens of thousands of files in a single folder

Bucket file examples:

```text
number/7999~6a.jsonl
mail/test~f.jsonl
fio/ив/иван~c.jsonl
```

### 5.2 `_documents`

Current lookup strategy:

- `md5(docId).slice(0, 3)`
- tree layout: `_documents/ab/abc.jsonl`

Why this is the current safe choice:

- stronger sharding than flat 2-char buckets
- avoids huge lookup buckets
- avoids dumping all lookup buckets into a single very large directory

## 6. Search Performance Optimizations Already Implemented

### 6.1 Narrowest bucket first

Search uses `meta/index_bucket_stats.json` to estimate which field bucket is smallest.

For multi-field queries:

- search starts with the narrowest bucket
- then intersects with wider buckets

This reduces unnecessary docId set growth.

### 6.2 Batched document chunk reads

When multiple matched documents belong to the same `documents/*.jsonl` file:

- search groups them by `fileName`
- reads chunks in batches
- avoids repeated `open/read/close` for each single document

### 6.3 Incremental publish during rebuild

When indexing from empty indexes:

- each processed document file can be published early
- search can start using the already built portion

## 7. Indexing Behavior

Indexing is sequential on purpose.

Current design principles:

- no multiple document files indexed in parallel
- resumable
- safe to interrupt
- partial publish supported

This is intentionally safer for very large local builds and easier to reason about operationally.

## 8. Commands

### 8.1 Split imported documents

Example:

```bash
npm run documents:split -- --db-root /path/to/MatrixData --max-size-gb 2
```

Typical usage:

- `1 GB` if you want smaller document segments
- `2 GB` if you want fewer files and still manageable size

### 8.2 Start full rebuild from scratch

```bash
npm run index:cli -- --db-root /path/to/MatrixData --clean
```

Ubuntu example:

```bash
cd /media/arm-5/data/zookeeper/Matrix
sudo npm run index:cli -- --db-root /media/arm-5/data/zookeeper/MatrixData --clean
```

### 8.3 Continue interrupted rebuild

```bash
npm run index:cli -- --db-root /path/to/MatrixData
```

Use this only when:

- there is a valid `state/index_state.json`
- there is a valid unfinished build in `temp/`

If you want a guaranteed fresh rebuild, use `--clean`.

### 8.4 Analyze index distribution

Fast mode:

```bash
npm run index:analyze -- --db-root /path/to/MatrixData
```

More detailed mode with real file size scan:

```bash
npm run index:analyze -- --db-root /path/to/MatrixData --scan
```

### 8.5 Search benchmark

Example:

```bash
npm run search:bench -- --db-root /path/to/MatrixData --number 70000000000
```

## 9. Safe Reset Procedure

If you want to restart indexing from scratch:

Remove only index-related runtime artifacts:

- `indexes/`
- `state/index_state.json`
- `meta/index_bucket_stats.json`
- `temp/index-build-*`
- `temp/index-backup-*`

Do **not** remove unless you really mean to reset the whole import:

- `documents/`
- `meta/sources.json`

## 10. What Is Safe To Change

Usually safe:

- document segment size target
- field bucket layout versioning
- bucket stats collection
- benchmark and analysis scripts
- `_documents` sharding strategy if format version is bumped

## 11. What Must Change Together

If you change `_documents` path strategy:

- update `SearchTermService.getDocumentBucketName()`
- update `LocalDatabasePaths.getDocumentLookupBucketPath()`
- bump `DOCUMENT_LOOKUP_FORMAT_VERSION`
- verify merge/publish code still finds lookup files
- verify search still resolves lookup buckets during `running`

If you change field bucket layout strategy:

- update `indexBucketLayouts.js`
- keep wildcard resolution compatible with any hash suffix strategy
- ensure `BuildLocalIndexesUseCase` writes new layout metadata
- ensure `SearchLocalDatabaseUseCase` reads layout from running `index_state` and from `db.json`

## 12. Operational Warnings

- Do not trust `meta/db.json` alone during an unfinished rebuild.
- During active rebuild, `index_state.json` is the source of truth for active layout.
- If search suddenly stops finding data during rebuild, first compare:
  - `meta/db.json`
  - `state/index_state.json`
- If `_documents` grows too large again, increase sharding only with a format version bump.
- Avoid reintroducing parallel index workers unless there is a strong reason and a test plan for resumability and partial publish.

## 13. Recommended Current Baseline

As of 2026-08-10:

- `documents` segmented to about `1-2 GB`
- dense field bucket layout version `3`, with `fio` additionally moved to layout version `4`
- lighter prefix-only fields remain on version `2` or `3` depending on field
- `_documents` lookup format version `6`
- `_documents` sharding: `md5(docId).slice(0, 3)` with tree layout `ab/abc.jsonl`
- search uses bucket stats for field ordering
- search batches chunk reads by `fileName`
- rebuild is resumable and searchable while running

This is the current reference architecture. Future changes should be compared against this baseline rather than against old flat index layouts.
