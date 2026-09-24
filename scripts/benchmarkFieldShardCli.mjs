import path from "node:path";
import { performance } from "node:perf_hooks";
import { INDEXABLE_FIELDS } from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { SqliteIndexStore } from "../src/main/sqlite/SqliteIndexStore.js";

function parseArgs(argv) {
  const args = { dbRoot: "", field: "mail", iterations: 3, term: "", withJson: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--db-root") args.dbRoot = argv[++index] || "";
    else if (argv[index] === "--field") args.field = argv[++index] || "";
    else if (argv[index] === "--iterations") args.iterations = Number(argv[++index]);
    else if (argv[index] === "--term") args.term = argv[++index] || "";
    else if (argv[index] === "--with-json") args.withJson = true;
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
const jsonLines = new JsonLinesRepository();
try {
  const sample = args.term || store.openExistingTermShard("00", true, args.field)
    ?.prepare("SELECT term FROM postings LIMIT 1").get()?.term;
  if (!sample) throw new Error(`No migrated terms for ${args.field} in shard 00.`);
  const samples = [];
  const indexSamples = [];
  let matches = 0;
  for (let index = 0; index < args.iterations; index += 1) {
    const started = performance.now();
    const keys = store.queryExact(args.field, sample, 250);
    const pointers = store.loadDocumentPointers(keys);
    indexSamples.push(performance.now() - started);
    if (args.withJson) {
      const groups = new Map();
      for (const pointer of pointers) {
        const group = groups.get(pointer.file_name) || [];
        group.push(pointer);
        groups.set(pointer.file_name, group);
      }
      for (const [fileName, group] of groups) {
        const values = await jsonLines.readChunks(
          paths.getDocumentPath(fileName),
          group.map((pointer) => ({
            byteOffset: pointer.byte_offset,
            byteLength: pointer.byte_length,
          }))
        );
        for (const value of values) JSON.parse(value);
      }
    }
    samples.push(performance.now() - started);
    matches = pointers.length;
  }
  console.log(
    `field=${args.field} matches=${matches} ` +
    `index_ms=${indexSamples.map((n) => n.toFixed(2)).join(",")} ` +
    `total_ms=${samples.map((n) => n.toFixed(2)).join(",")}`
  );
} finally {
  store.close();
}
