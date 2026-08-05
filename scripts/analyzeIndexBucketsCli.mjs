import path from "path";
import { EnsureLocalDatabaseReadyUseCase } from "../src/main/application/localdb/EnsureLocalDatabaseReadyUseCase.js";
import {
  DEFAULT_DATABASE_FOLDER_NAME,
  INDEXABLE_FIELDS,
} from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabaseMigrationService } from "../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";

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

  async ensureReady(rootPath = this.rootPath) {
    return await this.ensureReadyUseCase.execute(rootPath);
  }
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/analyzeIndexBucketsCli.mjs --db-root /path/to/MatrixData",
      "  node scripts/analyzeIndexBucketsCli.mjs --db-root /path/to/MatrixData --top 30",
      "",
      "Example:",
      "  npm run index:analyze -- --db-root /srv/data/MatrixData --top 20",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    dbRoot: "",
    top: 20,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--db-root") {
      args.dbRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--top") {
      args.top = Number(argv[index + 1] || 20);
      index += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.help = true;
    }
  }

  return args;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dbRoot) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const localDatabaseService = new CliLocalDatabaseService(args.dbRoot);
  const jsonLinesRepository = new JsonLinesRepository();

  await localDatabaseService.ensureReady();
  const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
  const bucketStats = [];
  const fieldSummaries = [];

  for (const field of INDEXABLE_FIELDS) {
    const fieldDir = paths.getIndexFieldDir(field);
    if (!(await jsonLinesRepository.exists(fieldDir))) {
      continue;
    }

    const bucketFiles = await jsonLinesRepository.listFiles(fieldDir, ".jsonl");
    let totalBytes = 0;
    let largestBytes = 0;
    let largestBucket = null;

    for (const bucketFile of bucketFiles) {
      const bucketPath = path.join(fieldDir, bucketFile);
      const stat = await jsonLinesRepository.stat(bucketPath);
      totalBytes += stat.size;
      if (stat.size > largestBytes) {
        largestBytes = stat.size;
        largestBucket = bucketFile;
      }

      bucketStats.push({
        field,
        bucket: bucketFile,
        sizeBytes: stat.size,
      });
    }

    fieldSummaries.push({
      field,
      buckets: bucketFiles.length,
      totalBytes,
      largestBucket,
      largestBytes,
    });
  }

  bucketStats.sort((left, right) => right.sizeBytes - left.sizeBytes);
  fieldSummaries.sort((left, right) => right.totalBytes - left.totalBytes);

  console.log(`Index bucket analysis for: ${paths.rootPath}`);
  console.log("");
  console.log("Field summary:");
  for (const summary of fieldSummaries) {
    console.log(
      `${summary.field}: buckets=${summary.buckets} total=${formatBytes(summary.totalBytes)} largest=${summary.largestBucket || "-"} (${formatBytes(summary.largestBytes)})`
    );
  }

  console.log("");
  console.log(`Top ${args.top} largest bucket files:`);
  for (const stat of bucketStats.slice(0, args.top)) {
    console.log(`${stat.field}/${stat.bucket}: ${formatBytes(stat.sizeBytes)}`);
  }
}

main().catch((error) => {
  console.error("Index analysis failed.");
  console.error(error);
  process.exitCode = 1;
});
