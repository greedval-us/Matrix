import fs from "fs/promises";
import path from "path";
import { BuildLocalIndexesUseCase } from "../src/main/application/localdb/BuildLocalIndexesUseCase.js";
import { EnsureLocalDatabaseReadyUseCase } from "../src/main/application/localdb/EnsureLocalDatabaseReadyUseCase.js";
import { LocalIndexBuildPlanner } from "../src/main/application/localdb/LocalIndexBuildPlanner.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { DEFAULT_DATABASE_FOLDER_NAME } from "../src/main/localdb/constants.js";
import { LocalDatabaseMigrationService } from "../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
import { OperationCoordinator } from "../src/main/localdb/OperationCoordinator.js";
import { SearchTermService } from "../src/main/localdb/SearchTermService.js";

class CliLocalDatabaseService {
  constructor(rootPath) {
    this.rootPath = this.normalizeRootPath(rootPath);
    this.stateRepository = new LocalDatabaseStateRepository();
    this.migrationService = new LocalDatabaseMigrationService({
      stateRepository: this.stateRepository,
    });
    this.ensureReadyUseCase = new EnsureLocalDatabaseReadyUseCase({
      localDatabaseService: this,
      migrationService: this.migrationService,
    });
  }

  normalizeRootPath(rootPath) {
    if (!rootPath) return "";

    const normalizedPath = path.normalize(rootPath);
    const parsedPath = path.parse(normalizedPath);

    if (normalizedPath === parsedPath.root) {
      return path.join(normalizedPath, DEFAULT_DATABASE_FOLDER_NAME);
    }

    return normalizedPath;
  }

  getStoredRootPath() {
    return this.rootPath;
  }

  async getStatus(rootPath = this.rootPath) {
    const normalizedRootPath = this.normalizeRootPath(rootPath);

    if (!normalizedRootPath) {
      return {
        exists: false,
        initialized: false,
        rootPath: "",
      };
    }

    try {
      const stat = await fs.stat(normalizedRootPath);
      if (!stat.isDirectory()) {
        return {
          exists: false,
          initialized: false,
          rootPath: normalizedRootPath,
        };
      }

      const metaPath = path.join(normalizedRootPath, "meta", "db.json");
      try {
        await fs.access(metaPath);
        return {
          exists: true,
          initialized: true,
          rootPath: normalizedRootPath,
        };
      } catch {
        return {
          exists: true,
          initialized: false,
          rootPath: normalizedRootPath,
        };
      }
    } catch {
      return {
        exists: false,
        initialized: false,
        rootPath: normalizedRootPath,
      };
    }
  }

  async ensureReady(rootPath = this.rootPath) {
    return await this.ensureReadyUseCase.execute(rootPath);
  }
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /path/to/MatrixData [--clean] [--workers 2] [--stage-only]",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /path/to/MatrixData --publish-staged",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /path/to/MatrixData --merge-staged",
      "",
      "Examples:",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData --clean",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData --workers 2",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData --clean --workers 3 --stage-only",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData --publish-staged",
      "  node scripts/buildLocalIndexesCli.mjs --db-root /srv/data/MatrixData --merge-staged",
      "  npm run index:cli -- --db-root /srv/data/MatrixData --clean",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    dbRoot: "",
    clean: false,
    workers: 1,
    stageOnly: false,
    mergeStaged: false,
    publishStaged: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--db-root") {
      args.dbRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }

    if (current === "--clean") {
      args.clean = true;
      continue;
    }

    if (current === "--workers") {
      args.workers = Number(argv[index + 1] || 1);
      index += 1;
      continue;
    }

    if (current === "--stage-only") {
      args.stageOnly = true;
      continue;
    }

    if (current === "--merge-staged") {
      args.mergeStaged = true;
      continue;
    }

    if (current === "--publish-staged") {
      args.publishStaged = true;
      continue;
    }

  }

  return args;
}

function formatProgress(payload) {
  const stage = payload.stage || "progress";
  const files = `${payload.filesProcessed ?? 0}/${payload.filesTotal ?? 0}`;
  const docs = `${payload.indexedDocuments ?? 0}/${payload.documentsTotal ?? 0}`;
  const workers = payload.workerCount ? ` workers=${payload.workerCount}` : "";
  const fileName = payload.currentFile ? ` file=${payload.currentFile}` : "";
  const mode = payload.buildMode ? ` mode=${payload.buildMode}` : "";
  const operation = payload.mergeStaged
    ? " merge-staged"
    : payload.publishStaged
      ? " publish-staged"
      : "";
  const parts = payload.partsTotal
    ? ` parts=${payload.partsProcessed ?? 0}/${payload.partsTotal}`
    : "";
  return `[index:${stage}] files=${files} docs=${docs}${workers}${mode}${operation}${parts}${fileName}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dbRoot) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  if ([args.stageOnly, args.mergeStaged, args.publishStaged].filter(Boolean).length > 1) {
    console.error("Use only one of --stage-only, --publish-staged, or --merge-staged.");
    process.exit(1);
  }

  const localDatabaseService = new CliLocalDatabaseService(args.dbRoot);
  const stateRepository = new LocalDatabaseStateRepository();
  const jsonLinesRepository = new JsonLinesRepository();
  const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());

  if (args.clean) {
    console.log(`Cleaning existing indexes for: ${paths.rootPath}`);
    await jsonLinesRepository.ensureDirectory(paths.rootPath);
    await jsonLinesRepository.remove(paths.indexesDir);
    await jsonLinesRepository.remove(paths.tempDir);
    await jsonLinesRepository.ensureDirectory(paths.metaDir);
    await jsonLinesRepository.ensureDirectory(paths.stateDir);
    await jsonLinesRepository.ensureDirectory(paths.tempDir);
    await stateRepository.writeIndexState(
      paths,
      stateRepository.buildInitialIndexState(new Date().toISOString())
    );
  }

  const useCase = new BuildLocalIndexesUseCase({
    localDatabaseService,
    stateRepository,
    jsonLinesRepository,
    operationCoordinator: new OperationCoordinator(),
    termService: new SearchTermService(),
    indexBuildPlanner: new LocalIndexBuildPlanner({
      jsonLinesRepository,
    }),
  });

  let shuttingDown = false;
  const stopBuild = (reason) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Stopping index build: ${reason}`);
    useCase.cancel(reason);
  };

  process.on("SIGINT", () => stopBuild("sigint"));
  process.on("SIGTERM", () => stopBuild("sigterm"));

  console.log(`Starting local index build for: ${localDatabaseService.getStoredRootPath()}`);

  const summary = await useCase.execute({
    workerCount: args.workers,
    stageOnly: args.stageOnly,
    mergeStaged: args.mergeStaged,
    publishStaged: args.publishStaged,
    onProgress: (payload) => {
      console.log(formatProgress(payload));
    },
  });

  console.log("Index build finished.");
  console.log(JSON.stringify(summary, null, 2));

  if (summary.status === "cancelled" && !args.publishStaged) {
    process.exitCode = 2;
    return;
  }

  if (summary.status === "failed") {
    process.exitCode = 1;
    return;
  }
}

main().catch((error) => {
  console.error("Index build failed to start.");
  console.error(error);
  process.exitCode = 1;
});
