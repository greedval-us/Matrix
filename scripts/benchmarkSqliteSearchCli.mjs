import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { SearchSqliteIndexesUseCase } from "../src/main/application/sqlite/SearchSqliteIndexesUseCase.js";
import { INDEXABLE_FIELDS } from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../src/main/localdb/SearchTermService.js";
import { SqliteIndexStore } from "../src/main/sqlite/SqliteIndexStore.js";

function parseArgs(argv) {
  const args = { dbRoot: "", iterations: 5, payload: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--db-root") args.dbRoot = argv[++index] || "";
    else if (value === "--iterations") args.iterations = Number(argv[++index]);
    else if (value === "--help" || value === "-h") args.help = true;
    else if (value.startsWith("--") && INDEXABLE_FIELDS.includes(value.slice(2))) {
      args.payload[value.slice(2)] = argv[++index] || "";
    } else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm run search:bench -- --db-root /path/to/MatrixData --mail user@example.org",
    "  npm run search:bench -- --db-root /path/to/MatrixData --fio '%ivanov%'",
    "",
    `Fields: ${INDEXABLE_FIELDS.join(", ")}`,
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printUsage();
  if (!args.dbRoot) throw new Error("--db-root is required.");
  if (Object.keys(args.payload).length === 0) throw new Error("A search field is required.");
  if (!Number.isSafeInteger(args.iterations) || args.iterations < 1) {
    throw new Error("--iterations must be a positive integer.");
  }

  const rootPath = path.resolve(args.dbRoot);
  await fs.access(path.join(rootPath, "meta", "db.json"));
  const paths = new LocalDatabasePaths(rootPath);
  const indexStore = new SqliteIndexStore({ paths });
  const useCase = new SearchSqliteIndexesUseCase({
    localDatabaseService: {
      getStoredRootPath: () => rootPath,
      ensureReady: async () => ({ initialized: true, rootPath }),
    },
    stateRepository: new LocalDatabaseStateRepository(),
    jsonLinesRepository: new JsonLinesRepository(),
    termService: new SearchTermService(),
    indexStore,
    maxResults: 250,
  });

  try {
    const samples = [];
    let matchedDocuments = 0;
    for (let index = 0; index < args.iterations; index += 1) {
      const startedAt = performance.now();
      const result = await useCase.execute(args.payload);
      samples.push(performance.now() - startedAt);
      matchedDocuments = result.filter((item) => item?.object_data).length;
    }
    const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
    console.log(`matched=${matchedDocuments}`);
    console.log(`samples_ms=${samples.map((value) => value.toFixed(2)).join(",")}`);
    console.log(`average_ms=${average.toFixed(2)}`);
  } finally {
    indexStore.close();
  }
}

main().catch((error) => {
  console.error("SQLite search benchmark failed.");
  console.error(error);
  process.exitCode = 1;
});
