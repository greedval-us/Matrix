import path from "node:path";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
import { migrateSqliteFieldIndexes, pruneMigratedSqliteIndexes } from "../src/main/sqlite/MigrateSqliteFieldIndexes.js";

async function main() {
  const argv = process.argv.slice(2);
  let dbRoot = "";
  let maxShards = Infinity;
  let pruneOld = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--db-root") dbRoot = argv[++index] || "";
    else if (argv[index] === "--max-shards") maxShards = Number(argv[++index]);
    else if (argv[index] === "--prune-old") pruneOld = true;
    else if (argv[index] === "--help" || argv[index] === "-h") {
      console.log("Usage: npm run sqlite:migrate-fields -- --db-root /path/to/MatrixData [--max-shards N | --prune-old]");
      return;
    } else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!dbRoot) throw new Error("--db-root is required.");
  if (maxShards !== Infinity && (!Number.isSafeInteger(maxShards) || maxShards < 1)) {
    throw new Error("--max-shards must be a positive integer.");
  }
  const paths = new LocalDatabasePaths(path.resolve(dbRoot));
  const stateRepository = new LocalDatabaseStateRepository();
  if (pruneOld) {
    if (maxShards !== Infinity) throw new Error("--prune-old cannot be combined with --max-shards.");
    await pruneMigratedSqliteIndexes({ paths, stateRepository });
    console.log("Old SQLite segments and base shards removed. Field shards retained.");
    return;
  }
  let stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
    console.log("Stopping after the current source shard...");
  });
  const result = await migrateSqliteFieldIndexes({
    paths,
    stateRepository,
    maxShards,
    shouldStop: () => stopping,
    onProgress(progress) {
      console.log(`[sqlite:migrate] source=${progress.sourceIndex}/${progress.sourcesTotal} ${progress.source} shard=${progress.shardIndex}/${progress.shardsTotal}`);
    },
  });
  console.log(`[sqlite:migrate:${result.status}] shards=${result.processedShards}`);
}

main().catch((error) => {
  console.error("SQLite field migration failed.", error);
  process.exitCode = 1;
});
