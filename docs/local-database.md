# Matrix Local Database

## Purpose

Matrix is a standalone desktop application. The database can live on an external disk and
does not require MySQL, Manticore, OpenSearch, Docker, or a background service.

SQLite with FTS5 is the primary search engine. Electron provides the SQLite runtime on both
Windows and Ubuntu, so system SQLite and a recent system Node.js are not required.

## Storage Layout

```text
MatrixData/
  documents/                 original JSONL records
  sqlite-indexes-v3/
    field-shards/
      terms/
        number/              64 hash shards for phone numbers
        passport/            64 hash shards for passports
        .../                 one directory per indexed field
      documents/             64 JSONL pointer shards shared by all fields
  meta/
    db.json
    sources.json
    search_backend.json
  state/
    sqlite_index_state.json  atomic resume checkpoint
    sqlite_field_migration.json  SQLite-to-SQLite migration checkpoint
```

The indexer never rewrites or copies `documents/`. Full records remain in JSONL; SQLite
contains normalized search terms, compact document keys, and byte pointers to the originals.

Existing v3 databases may still use an immutable base plus bounded segments. The field
migration below converts their SQLite postings and JSONL pointers directly into global
field-specific hash shards without rereading JSONL. Once switched, exact search opens only
the relevant field shard and document-pointer shard. Prefix searches use B-tree indexes.
Leading-wildcard searches use FTS5 trigrams built in a separate resumable phase. A wildcard
query must contain at least three consecutive literal characters.

## Migrate Completed Segment Indexes

Run this only after core SQLite indexing has completed and no indexer is running:

```bash
npm run sqlite:migrate-fields -- --db-root /media/arm-5/data/zookeeper/MatrixData
```

The command copies **only existing SQLite indexes**, never scans `documents/*.jsonl`, and
checkpoints each source shard. `Ctrl+C` stops after the current shard; the same command
resumes after interruption or power loss. Use `--max-shards 1` for a small trial. The app
continues searching the old segments until every shard has been copied and verified. The
state then switches atomically to `field-shards-v1`. Allow enough free space for both copies
until validation is complete. Do not run the core indexer or wildcard builder concurrently
with the migration.

Migration version 2 processes one target hash shard across every source before moving to
the next shard. This keeps the active SQLite B-trees in memory and reduces write
amplification on rotational storage. Migration-only databases use `synchronous=NORMAL`, a
larger page cache, and less frequent WAL checkpoints. Source indexes remain untouched, and
the checkpoint is written only after a verified source/shard pair, so an interrupted pair is
safely replayed. Existing version 1 checkpoints are upgraded automatically without
rewriting pairs that were already completed.

Check representative exact searches and document results before removing old SQLite files:

```bash
npm run sqlite:migrate-fields -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData \
  --prune-old
```

`--prune-old` removes only the old v3 base `terms/`, base `documents/`, and `segments/`.
It leaves `field-shards/`, all JSONL, metadata, and checkpoints intact. Run
`--wildcards-only` afterward to build wildcard FTS for the new layout.

## Install And Check

Install project dependencies separately on each operating system. Do not copy `node_modules`
between Windows and Ubuntu.

```bash
npm ci
npm run sqlite:check
```

## Trial Build

Build a small sample before committing disk space to the complete database:

```bash
npm run sqlite:index -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData \
  --max-files 10 \
  --clean
```

`--clean` removes only old `sqlite-indexes-v1/`, `sqlite-indexes-v2/`, the current
`sqlite-indexes-v3/`, and
`state/sqlite_index_state.json`. It never removes `documents/`, metadata, or legacy
indexes.

## Full Build And Resume

Start a new complete build only when no usable SQLite checkpoint exists:

```bash
npm run sqlite:index -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData \
  --clean
```

Continue after `Ctrl+C`, a reboot, or a power failure:

```bash
npm run sqlite:index -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData
```

Do not use `--clean` when continuing. Progress is committed every 100,000 records and the
checkpoint stores the next JSONL byte offset. Replayed records use unique keys and cannot
create duplicate postings. On slow RAID storage, `--batch-size 100000` avoids hundreds of
durable disk synchronizations per small batch. A smaller value creates more frequent
checkpoints but is usually slower.

An existing non-segmented v3 index is migrated automatically on the first continuation: its
files become the immutable base, the current document counter is saved as
`baseIndexedDocuments`, and only later records are written to `segments/`. This operation
does not copy SQLite files and does not reread `documents/`. Keep the checkpoint and run the
normal continuation command without `--clean`.

Do not rename, modify, or remove an already indexed document file while a build is resumable.
New JSONL files may be added after completion and will be indexed incrementally.

## Wildcard Build

The core pass deliberately skips FTS to keep multi-terabyte indexing sequential and fast.
After the core pass, build or resume leading-wildcard indexes:

```bash
npm run sqlite:index -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData \
  --wildcards-only
```

The command checkpoints after every term shard in the active layout. Stop it with
`Ctrl+C` and repeat the same command to continue. Exact and prefix search are available from
committed core batches; leading `%` and `?` require a wildcard snapshot matching the current
core index. If new documents are indexed later, repeat `--wildcards-only`.

## Activate Search

SQLite is the default backend for new installations. To explicitly activate it after a full
build:

```bash
npm run sqlite:index -- \
  --db-root /media/arm-5/data/zookeeper/MatrixData \
  --activate
```

The application can search committed batches while indexing is running or stopped. Results
are read from the original JSONL records.

## Legacy Cleanup

The old JSONL search reader remains temporarily available only for migration. After a full
SQLite build and representative search checks, these old index artifacts may be removed:

- `indexes/`
- old `temp/index-build-*` and `temp/index-backup-*`
- `state/index_state.json`
- `meta/index_bucket_stats.json`

Never remove `documents/`, `meta/db.json`, or `meta/sources.json`. The system-level
MySQL or Manticore installation is unrelated to Matrix and is not modified by this migration.

## Commands

```bash
# Check bundled SQLite and FTS5
npm run sqlite:check

# Split oversized source JSONL files without indexing
npm run documents:split -- --db-root /path/to/MatrixData --max-size-gb 2

# Show indexer options
npm run sqlite:index -- --help

# Benchmark the active SQLite index
npm run search:bench -- --db-root /path/to/MatrixData --mail user@example.org

# Run project tests
npm test
```
