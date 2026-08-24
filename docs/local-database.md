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
    terms/                   64 global term shards
    documents/               sharded JSONL byte pointers
  meta/
    db.json
    sources.json
    search_backend.json
  state/
    sqlite_index_state.json  atomic resume checkpoint
```

The indexer never rewrites or copies `documents/`. Full records remain in JSONL; SQLite
contains normalized search terms, compact document keys, and byte pointers to the originals.

The format uses 64 global term shards and 64 document-pointer shards. This keeps the number
of active SQLite databases fixed regardless of the number of fields. Exact and prefix
searches use B-tree indexes. Leading-wildcard searches use FTS5 trigrams built in a separate
resumable phase. A wildcard query must contain at least three consecutive literal characters.

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

Start a new complete build:

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

The command checkpoints after every one of 64 term shards. Stop it with `Ctrl+C` and repeat
the same command to continue. Exact and prefix search are available from committed core
batches; leading `%` and `?` require a wildcard snapshot matching the current core index.
If new documents are indexed later, repeat `--wildcards-only`.

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
