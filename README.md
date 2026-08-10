# Matrix

Desktop application for local database import, indexing, and search.

Project docs:

- [Local Database Guide](docs/local-database.md)

Useful commands:

```bash
npm run documents:split -- --db-root /path/to/MatrixData --max-size-gb 2
npm run index:cli -- --db-root /path/to/MatrixData --clean
npm run index:analyze -- --db-root /path/to/MatrixData
npm run search:bench -- --db-root /path/to/MatrixData --number 70000000000
```
