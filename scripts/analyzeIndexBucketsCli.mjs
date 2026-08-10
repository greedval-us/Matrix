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
      "  node scripts/analyzeIndexBucketsCli.mjs --db-root /path/to/MatrixData --scan",
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
    scan: false,
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

    if (current === "--scan") {
      args.scan = true;
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
  const stateRepository = new LocalDatabaseStateRepository();

  await localDatabaseService.ensureReady();
  const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
  const storedBucketStats = await stateRepository.readIndexBucketStats(paths);
  const sizeStats = args.scan
    ? await collectBucketSizeStats(paths, jsonLinesRepository)
    : null;

  const fieldSummaries = buildFieldSummaries(storedBucketStats, sizeStats);
  const bucketStats = buildBucketStats(storedBucketStats, sizeStats);

  bucketStats.sort((left, right) => {
    return (
      right.documentCount - left.documentCount ||
      right.sizeBytes - left.sizeBytes ||
      left.field.localeCompare(right.field) ||
      left.bucket.localeCompare(right.bucket)
    );
  });
  fieldSummaries.sort((left, right) => {
    return (
      right.documents - left.documents ||
      right.totalBytes - left.totalBytes ||
      left.field.localeCompare(right.field)
    );
  });

  console.log(`Index bucket analysis for: ${paths.rootPath}`);
  console.log("");
  if (storedBucketStats?.builtAt) {
    console.log(`Bucket stats built at: ${storedBucketStats.builtAt}`);
  } else {
    console.log("Bucket stats built at: not found");
  }
  console.log(`Mode: ${args.scan ? "stats + live file scan" : "stats only"}`);
  console.log("");
  console.log("Field summary:");
  for (const summary of fieldSummaries) {
    console.log(
      `${summary.field}: buckets=${summary.buckets} docs=${summary.documents} total=${formatBytes(summary.totalBytes)} avg=${summary.averageDocumentsPerBucket} largest=${summary.largestBucket || "-"} docs=${summary.largestBucketDocuments} size=${formatBytes(summary.largestBytes)}`
    );
  }

  console.log("");
  console.log(`Top ${args.top} hottest bucket files:`);
  for (const stat of bucketStats.slice(0, args.top)) {
    console.log(
      `${stat.field}/${stat.bucket}: docs=${stat.documentCount} size=${formatBytes(stat.sizeBytes)}`
    );
  }
}

async function collectBucketSizeStats(paths, jsonLinesRepository) {
  const sizeStats = {
    fields: {},
  };

  for (const field of INDEXABLE_FIELDS) {
    const fieldDir = paths.getIndexFieldDir(field);
    if (!(await jsonLinesRepository.exists(fieldDir))) {
      continue;
    }

    const bucketFiles = await jsonLinesRepository.listFilesRecursive(fieldDir, ".jsonl");
    const fieldStats = {};

    for (const bucketFile of bucketFiles) {
      const bucketPath = path.join(fieldDir, bucketFile);
      const stat = await jsonLinesRepository.stat(bucketPath);
      fieldStats[path.basename(bucketFile, ".jsonl")] = stat.size;
    }

    sizeStats.fields[field] = fieldStats;
  }

  return sizeStats;
}

function buildFieldSummaries(storedBucketStats, sizeStats) {
  const fieldSummaries = [];

  for (const field of INDEXABLE_FIELDS) {
    const docBuckets = storedBucketStats?.fields?.[field] || {};
    const sizeBuckets = sizeStats?.fields?.[field] || {};
    const bucketNames = new Set([...Object.keys(docBuckets), ...Object.keys(sizeBuckets)]);
    if (bucketNames.size === 0) {
      continue;
    }

    let documents = 0;
    let totalBytes = 0;
    let largestBucket = null;
    let largestBucketDocuments = 0;
    let largestBytes = 0;

    for (const bucketName of bucketNames) {
      const bucketDocuments = Number(docBuckets[bucketName] || 0);
      const bucketBytes = Number(sizeBuckets[bucketName] || 0);
      documents += bucketDocuments;
      totalBytes += bucketBytes;

      if (
        bucketDocuments > largestBucketDocuments ||
        (bucketDocuments === largestBucketDocuments && bucketBytes > largestBytes)
      ) {
        largestBucket = `${bucketName}.jsonl`;
        largestBucketDocuments = bucketDocuments;
        largestBytes = bucketBytes;
      }
    }

    fieldSummaries.push({
      field,
      buckets: bucketNames.size,
      documents,
      totalBytes,
      averageDocumentsPerBucket: Math.round(documents / Math.max(bucketNames.size, 1)),
      largestBucket,
      largestBucketDocuments,
      largestBytes,
    });
  }

  return fieldSummaries;
}

function buildBucketStats(storedBucketStats, sizeStats) {
  const bucketStats = [];

  for (const field of INDEXABLE_FIELDS) {
    const docBuckets = storedBucketStats?.fields?.[field] || {};
    const sizeBuckets = sizeStats?.fields?.[field] || {};
    const bucketNames = new Set([...Object.keys(docBuckets), ...Object.keys(sizeBuckets)]);

    for (const bucketName of bucketNames) {
      bucketStats.push({
        field,
        bucket: `${bucketName}.jsonl`,
        documentCount: Number(docBuckets[bucketName] || 0),
        sizeBytes: Number(sizeBuckets[bucketName] || 0),
      });
    }
  }

  return bucketStats;
}

main().catch((error) => {
  console.error("Index analysis failed.");
  console.error(error);
  process.exitCode = 1;
});
