import fs from "fs/promises";
import path from "path";
import { performance } from "node:perf_hooks";
import { SearchLocalDatabaseUseCase } from "../src/main/application/localdb/SearchLocalDatabaseUseCase.js";
import { EnsureLocalDatabaseReadyUseCase } from "../src/main/application/localdb/EnsureLocalDatabaseReadyUseCase.js";
import {
  DEFAULT_DATABASE_FOLDER_NAME,
  INDEXABLE_FIELDS,
} from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabaseMigrationService } from "../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
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
      "  node scripts/benchmarkLocalSearchCli.mjs --db-root /path/to/MatrixData --number 79991234567 [--iterations 5] [--warmup 1]",
      "",
      "Supported fields:",
      `  ${INDEXABLE_FIELDS.join(", ")}`,
      "",
      "Examples:",
      "  node scripts/benchmarkLocalSearchCli.mjs --db-root /srv/data/MatrixData --number 79991234567",
      "  node scripts/benchmarkLocalSearchCli.mjs --db-root /srv/data/MatrixData --fio \"ИВАНОВ ИВАН\" --iterations 10 --warmup 2",
      "  npm run search:bench -- --db-root /srv/data/MatrixData --passport 1234567890",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    dbRoot: "",
    iterations: 5,
    warmup: 1,
    payload: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--db-root") {
      args.dbRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--iterations") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 1) {
        args.iterations = Math.trunc(value);
      }
      index += 1;
      continue;
    }

    if (current === "--warmup") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value) && value >= 0) {
        args.warmup = Math.trunc(value);
      }
      index += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }

    if (current.startsWith("--")) {
      const fieldName = current.slice(2);
      if (INDEXABLE_FIELDS.includes(fieldName)) {
        args.payload[fieldName] = argv[index + 1] || "";
        index += 1;
      }
    }
  }

  return args;
}

function countMatchedDocuments(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item?.object_data).length;
}

function countMatchedSources(items) {
  if (!Array.isArray(items)) return 0;
  return items.filter((item) => item?.object_data_base).length;
}

function formatMs(value) {
  return `${value.toFixed(2)} ms`;
}

function printProfile(profile) {
  if (!profile) return;

  console.log("  profile:");
  console.log(`    ensureReady:    ${formatMs(profile.ensureReadyMs || 0)}`);
  console.log(`    intersect:      ${formatMs(profile.intersectMs || 0)}`);
  console.log(`    loadDocuments:  ${formatMs(profile.loadDocumentsMs || 0)}`);
  console.log(`    loadSourceMeta: ${formatMs(profile.loadSourceMetaMs || 0)}`);
  console.log(`    buildResults:   ${formatMs(profile.buildResultsMs || 0)}`);
  console.log(`    total:          ${formatMs(profile.totalMs || 0)}`);
  console.log(`    matchedDocIds:  ${profile.matchedDocIds || 0}`);
  console.log(`    loadedDocs:     ${profile.loadedDocuments || 0}`);

  if (Array.isArray(profile.queryFields) && profile.queryFields.length) {
    console.log("    queryFields:");
    for (const item of profile.queryFields) {
      console.log(
        `      - ${item.field} term=${item.term} docIds=${item.matchedDocIds} time=${formatMs(item.durationMs)}`
      );
    }
  }

  const buckets = Array.isArray(profile.lookupBuckets) ? profile.lookupBuckets : [];
  if (buckets.length) {
    const slowestBuckets = [...buckets]
      .sort((left, right) => (right.durationMs || 0) - (left.durationMs || 0))
      .slice(0, 10);
    console.log("    slowestBuckets:");
    for (const bucket of slowestBuckets) {
      if (bucket.kind === "documentLookup") {
        console.log(
          `      - lookup bucket=${bucket.bucket} scanned=${bucket.scannedEntries} resolved=${bucket.resolvedDocuments} remaining=${bucket.remainingDocIds} time=${formatMs(bucket.durationMs)}`
        );
      } else {
        console.log(
          `      - index field=${bucket.field} scanned=${bucket.scannedEntries} matches=${bucket.matchedDocIds} file=${bucket.bucketPath} time=${formatMs(bucket.durationMs)}`
        );
      }
    }
  }
}

function buildStats(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const average = total / sorted.length;
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: average,
    median,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dbRoot || Object.keys(args.payload).length === 0) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  const localDatabaseService = new CliLocalDatabaseService(args.dbRoot);
  const useCase = new SearchLocalDatabaseUseCase({
    localDatabaseService,
    stateRepository: new LocalDatabaseStateRepository(),
    jsonLinesRepository: new JsonLinesRepository(),
    termService: new SearchTermService(),
  });

  console.log(`Benchmarking local search for: ${localDatabaseService.getStoredRootPath()}`);
  console.log(`Payload: ${JSON.stringify(args.payload)}`);
  console.log(`Warmup: ${args.warmup}, iterations: ${args.iterations}`);

  for (let index = 0; index < args.warmup; index += 1) {
    await useCase.execute(args.payload);
  }

  const samples = [];
  let lastResults = [];

  for (let index = 0; index < args.iterations; index += 1) {
    const profile = {};
    const startedAt = performance.now();
    const results = await useCase.execute(args.payload, { profile });
    const finishedAt = performance.now();

    const durationMs = finishedAt - startedAt;
    samples.push(durationMs);
    lastResults = results;

    console.log(
      `[run ${index + 1}/${args.iterations}] ${formatMs(durationMs)} | sources=${countMatchedSources(results)} docs=${countMatchedDocuments(results)}`
    );
    printProfile(profile);
  }

  const stats = buildStats(samples);
  console.log("");
  console.log("Summary:");
  console.log(`  min:    ${formatMs(stats.min)}`);
  console.log(`  avg:    ${formatMs(stats.avg)}`);
  console.log(`  median: ${formatMs(stats.median)}`);
  console.log(`  max:    ${formatMs(stats.max)}`);
  console.log(`  sources: ${countMatchedSources(lastResults)}`);
  console.log(`  docs:    ${countMatchedDocuments(lastResults)}`);
}

main().catch((error) => {
  console.error("Search benchmark failed.");
  console.error(error);
  process.exitCode = 1;
});
