# Matrix

Desktop application for local database import, indexing, and search.

Project docs:

- [Local Database Guide](docs/local-database.md)

Useful commands:

```bash
npm run documents:split -- --db-root /path/to/MatrixData --max-size-gb 2
npm run sqlite:check
npm run sqlite:index -- --db-root /path/to/MatrixData --batch-size 100000
npm run sqlite:index -- --db-root /path/to/MatrixData --wildcards-only
npm run sqlite:migrate-fields -- --db-root /path/to/MatrixData
```

Matrix uses an embedded sharded SQLite/FTS5 search engine. No database server is required.
See the safe migration procedure in the local database guide.
