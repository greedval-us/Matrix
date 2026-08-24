import fs from "node:fs/promises";
import path from "node:path";
import { BuildSqliteIndexesUseCase } from "../src/main/application/sqlite/BuildSqliteIndexesUseCase.js";
import { BuildSqliteWildcardIndexesUseCase } from "../src/main/application/sqlite/BuildSqliteWildcardIndexesUseCase.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../src/main/localdb/SearchTermService.js";
import { normalizeSearchBackendConfig } from "../src/main/sqlite/SearchBackendConfig.js";
import { SqliteIndexStore } from "../src/main/sqlite/SqliteIndexStore.js";

function parseArgs(argv) {
  const args = { dbRoot: "", clean: false, activate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--db-root") args.dbRoot = argv[++index] || "";
    else if (value === "--max-files") args.maxFiles = Number(argv[++index]);
    else if (value === "--batch-size") args.batchSize = Number(argv[++index]);
    else if (value === "--wildcards-only") args.wildcardsOnly = true;
    else if (value === "--clean") args.clean = true;
    else if (value === "--activate") args.activate = true;
    else if (value === "--help" || value === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  return args;
}

function printUsage() {
  console.log([
    "Usage:",
    "  npm run sqlite:index -- --db-root /path/to/MatrixData [options]",
    "",
    "Options:",
    "  --max-files N    Process at most N document files in this run",
    "  --batch-size N   Commit every N documents (default: 100000)",
    "  --wildcards-only Build/resume FTS indexes used by leading wildcards",
    "  --clean          Delete only SQLite indexes and their checkpoint first",
    "  --activate       Enable SQLite search after the full build completes",
    "",
    "Ctrl+C stops after the active SQLite batch. Repeat without --clean to resume.",
    "documents/, legacy indexes/, metadata and sources are never removed.",
  ].join("\n"));
}

class CliDatabaseService {
  constructor(rootPath) { this.rootPath = path.resolve(rootPath); }
  getStoredRootPath() { return this.rootPath; }
  async ensureReady() {
    await fs.access(path.join(this.rootPath, "meta", "db.json"));
    return { initialized: true, rootPath: this.rootPath };
  }
}

async function getDirectoryStats(directoryPath) {
  let files = 0;
  let bytes = 0;
  const walk = async (currentPath) => {
    let entries;
    try { entries = await fs.readdir(currentPath, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) await walk(entryPath);
      else if (entry.isFile()) {
        files += 1;
        bytes += (await fs.stat(entryPath)).size;
      }
    }
  };
  await walk(directoryPath);
  return { files, bytes };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printUsage();
  if (!args.dbRoot) throw new Error("--db-root is required.");
  if (args.clean && args.wildcardsOnly) {
    throw new Error("--clean cannot be combined with --wildcards-only.");
  }
  if (args.batchSize !== undefined &&
      (!Number.isSafeInteger(args.batchSize) || args.batchSize < 1000)) {
    throw new Error("--batch-size must be an integer of at least 1000.");
  }

  const localDatabaseService = new CliDatabaseService(args.dbRoot);
  await localDatabaseService.ensureReady();
  const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
  const stateRepository = new LocalDatabaseStateRepository();
  const indexStore = new SqliteIndexStore({ paths });
  const useCase = new BuildSqliteIndexesUseCase({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository: new JsonLinesRepository(),
    termService: new SearchTermService(),
    indexStore,
    batchDocuments: args.batchSize,
  });
  const wildcardUseCase = new BuildSqliteWildcardIndexesUseCase({
    localDatabaseService,
    stateRepository,
    indexStore,
  });
  let stopping = false;
  process.on("SIGINT", () => {
    if (stopping) return;
    stopping = true;
    console.log("\nStopping safely after the active SQLite batch...");
    useCase.cancel();
    wildcardUseCase.cancel();
  });

  try {
    const result = args.wildcardsOnly
      ? await wildcardUseCase.execute({
          onProgress(progress) {
            console.log(
              `[sqlite:wildcards:${progress.status}] ` +
              `shards=${progress.shardsProcessed}/${progress.shardsTotal} ` +
              `shard=${progress.shard || "-"}`
            );
          },
        })
      : await useCase.execute({
      clean: args.clean,
      maxFiles: args.maxFiles,
      onProgress(progress) {
        const percent = progress.currentFileSize
          ? Math.floor((progress.byteOffset / progress.currentFileSize) * 100)
          : 0;
        console.log(
          `[sqlite:${progress.status}] files=${progress.filesProcessed}/${progress.filesTotal} ` +
          `docs=${progress.indexedDocuments} file=${progress.currentFile || "-"} ` +
          `fileProgress=${percent}%`
        );
      },
        });
    indexStore.close();
    const stats = await getDirectoryStats(paths.sqliteIndexesDir);
    console.log(
      `SQLite index size: ${(stats.bytes / 1024 ** 3).toFixed(2)} GiB in ${stats.files} files.`
    );
    if (args.activate && result.status === "completed") {
      const saved = normalizeSearchBackendConfig(
        await stateRepository.readSearchBackendConfig(paths)
      );
      await stateRepository.writeSearchBackendConfig(paths, { ...saved, backend: "sqlite" });
      console.log("Matrix search backend switched to SQLite.");
    } else if (args.activate) {
      console.log("SQLite was not activated because indexing is not complete.");
    }
  } finally {
    indexStore.close();
  }
}

main().catch((error) => {
  console.error("SQLite index build failed.");
  console.error(error);
  process.exitCode = 1;
});
