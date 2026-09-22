import path from "node:path";
import { performance } from "node:perf_hooks";
import { INDEXABLE_FIELDS } from "../src/main/localdb/constants.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { SqliteIndexStore } from "../src/main/sqlite/SqliteIndexStore.js";

function parseArgs(argv) {
  const args = { dbRoot: "", field: "mail", iterations: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--db-root") args.dbRoot = argv[++index] || "";
    else if (argv[index] === "--field") args.field = argv[++index] || "";
    else if (argv[index] === "--iterations") args.iterations = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!args.dbRoot || !INDEXABLE_FIELDS.includes(args.field) ||
      !Number.isSafeInteger(args.iterations) || args.iterations < 1) {
    throw new Error("Usage: --db-root PATH --field mail|number|fio|... [--iterations 3]");
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const paths = new LocalDatabasePaths(path.resolve(args.dbRoot));
const store = new SqliteIndexStore({ paths, indexesDir: paths.sqliteFieldIndexesDir, fieldScoped: true });
try {
  const sample = store.openExistingTermShard("00", true, args.field)
    ?.prepare("SELECT term FROM postings LIMIT 1").get()?.term;
  if (!sample) throw new Error(`No migrated terms for ${args.field} in shard 00.`);
  const samples = [];
  let matches = 0;
  for (let index = 0; index < args.iterations; index += 1) {
    const started = performance.now();
    const keys = store.queryExact(args.field, sample, 250);
    const pointers = store.loadDocumentPointers(keys);
    samples.push(performance.now() - started);
    matches = pointers.length;
  }
  console.log(`field=${args.field} matches=${matches} samples_ms=${samples.map((n) => n.toFixed(2)).join(",")}`);
} finally {
  store.close();
}
