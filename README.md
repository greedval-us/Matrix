# Matrix

Desktop application for local database import, indexing, and search.

Project docs:

- [Local Database Guide](docs/local-database.md)

Useful commands:

```bash
npm run documents:split -- --db-root /path/to/MatrixData --max-size-gb 2
npm run sqlite:check
npm run sqlite:index -- --db-root /path/to/MatrixData --max-files 10 --batch-size 100000 --clean
npm run sqlite:index -- --db-root /path/to/MatrixData --wildcards-only
```

Matrix uses an embedded sharded SQLite/FTS5 search engine. No database server is required.
See the safe migration procedure in the local database guide.
