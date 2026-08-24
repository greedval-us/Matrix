const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(":memory:");
const version = database.prepare("SELECT sqlite_version() AS version").get().version;
database.exec("CREATE VIRTUAL TABLE test_fts USING fts5(term, tokenize='trigram')");
database.close();
console.log(
  `SQLite ${version}: built-in node:sqlite and FTS5 trigram are ready for Electron.`
);
