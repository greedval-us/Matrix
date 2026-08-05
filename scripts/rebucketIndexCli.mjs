import path from "path";
import { fileURLToPath } from "url";
import { EnsureLocalDatabaseReadyUseCase } from "../src/main/application/localdb/EnsureLocalDatabaseReadyUseCase.js";
import {
  DEFAULT_DATABASE_FOLDER_NAME,
  INDEXABLE_FIELDS,
  LEGACY_INDEX_BUCKET_LAYOUT_VERSION,
} from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import {
  getLatestBucketLayoutVersion,
  normalizeBucketLayoutMap,
} from "../src/main/localdb/indexBucketLayouts.js";
import { LocalDatabaseMigrationService } from "../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";
import { SearchTermService } from "../src/main/localdb/SearchTermService.js";

const FLUSH_BUFFER_SIZE = 20000;

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
      "  node scripts/rebucketIndexCli.mjs --db-root /path/to/MatrixData --field number",
      "  node scripts/rebucketIndexCli.mjs --db-root /path/to/MatrixData --field number,passport",
      "  node scripts/rebucketIndexCli.mjs --db-root /path/to/MatrixData --field fio --to-version 2",
      "",
      "Example:",
      "  npm run index:rebucket -- --db-root /srv/data/MatrixData --field number",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    dbRoot: "",
    fields: [],
    toVersion: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--db-root") {
      args.dbRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--field") {
      const rawValue = argv[index + 1] || "";
      args.fields.push(
        ...rawValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      );
      index += 1;
      continue;
    }

    if (current === "--to-version") {
      args.toVersion = Number(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (current === "--help" || current === "-h") {
      args.help = true;
    }
  }

  return args;
}

async function flushBuffer(jsonLinesRepository, bufferMap, filePath) {
  const lines = bufferMap.get(filePath);
  if (!lines || lines.length === 0) return;

  await jsonLinesRepository.appendLines(filePath, lines);
  bufferMap.set(filePath, []);
}

async function flushAll(jsonLinesRepository, bufferMap) {
  for (const filePath of bufferMap.keys()) {
    await flushBuffer(jsonLinesRepository, bufferMap, filePath);
  }
}

function ensureSupportedFields(fields) {
  const unsupportedFields = fields.filter((field) => !INDEXABLE_FIELDS.includes(field));
  if (unsupportedFields.length > 0) {
    throw new Error(`Unsupported fields: ${unsupportedFields.join(", ")}`);
  }
}

function resolveGlobalBucketLayoutVersion(bucketLayouts) {
  const versions = Object.values(bucketLayouts);
  if (versions.length === 0) {
    return LEGACY_INDEX_BUCKET_LAYOUT_VERSION;
  }

  const [firstVersion] = versions;
  return versions.every((version) => version === firstVersion)
    ? firstVersion
    : LEGACY_INDEX_BUCKET_LAYOUT_VERSION;
}

async function rebucketField({
  field,
  targetVersion,
  paths,
  jsonLinesRepository,
  termService,
}) {
  const fieldDir = paths.getIndexFieldDir(field);
  if (!(await jsonLinesRepository.exists(fieldDir))) {
    console.log(`Skipping ${field}: index directory not found.`);
    return { field, scannedEntries: 0, bucketFiles: 0, changed: false };
  }

  const rebuildId = new Date().toISOString().replace(/[:.]/g, "-");
  const tempFieldDir = paths.getTempPath(`${field}-rebucket-${rebuildId}`);
  const backupFieldDir = paths.getTempPath(`${field}-rebucket-backup-${rebuildId}`);
  const bucketFiles = await jsonLinesRepository.listFiles(fieldDir, ".jsonl");
  const bufferMap = new Map();
  let scannedEntries = 0;

  await jsonLinesRepository.remove(tempFieldDir);
  await jsonLinesRepository.remove(backupFieldDir);
  await jsonLinesRepository.ensureDirectory(tempFieldDir);

  for (const bucketFile of bucketFiles) {
    const sourcePath = path.join(fieldDir, bucketFile);
    console.log(`Processing ${field}/${bucketFile}`);

    for await (const entry of jsonLinesRepository.iterateJson(sourcePath)) {
      scannedEntries += 1;
      const targetBucket = termService.getIndexBucketName(field, entry.term, targetVersion);
      const targetPath = path.join(tempFieldDir, `${targetBucket}.jsonl`);
      const lines = bufferMap.get(targetPath) || [];
      lines.push(JSON.stringify(entry));
      bufferMap.set(targetPath, lines);

      if (lines.length >= FLUSH_BUFFER_SIZE) {
        await flushBuffer(jsonLinesRepository, bufferMap, targetPath);
      }

      if (scannedEntries % 500000 === 0) {
        console.log(`${field}: scanned entries ${scannedEntries}`);
      }
    }
  }

  await flushAll(jsonLinesRepository, bufferMap);

  try {
    await jsonLinesRepository.move(fieldDir, backupFieldDir);
    await jsonLinesRepository.move(tempFieldDir, fieldDir);
    await jsonLinesRepository.remove(backupFieldDir);
  } catch (error) {
    if (await jsonLinesRepository.exists(backupFieldDir)) {
      await jsonLinesRepository.remove(fieldDir);
      await jsonLinesRepository.move(backupFieldDir, fieldDir);
    }
    throw error;
  }

  return {
    field,
    scannedEntries,
    bucketFiles: bucketFiles.length,
    changed: true,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.dbRoot || args.fields.length === 0) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  ensureSupportedFields(args.fields);

  const localDatabaseService = new CliLocalDatabaseService(args.dbRoot);
  const jsonLinesRepository = new JsonLinesRepository();
  const stateRepository = new LocalDatabaseStateRepository();
  const termService = new SearchTermService();

  await localDatabaseService.ensureReady();
  const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
  const meta = await stateRepository.readJson(paths.databaseMetaPath, null);
  const bucketLayouts = normalizeBucketLayoutMap(meta?.indexes || {});
  const results = [];

  for (const field of [...new Set(args.fields)]) {
    const currentVersion =
      bucketLayouts[field] || LEGACY_INDEX_BUCKET_LAYOUT_VERSION;
    const targetVersion = args.toVersion || getLatestBucketLayoutVersion(field);

    if (currentVersion === targetVersion) {
      console.log(`Skipping ${field}: already on bucket layout version ${targetVersion}.`);
      results.push({ field, scannedEntries: 0, bucketFiles: 0, changed: false });
      continue;
    }

    console.log(
      `Rebucketing ${field} from layout v${currentVersion} to v${targetVersion} for: ${paths.rootPath}`
    );

    const result = await rebucketField({
      field,
      targetVersion,
      paths,
      jsonLinesRepository,
      termService,
    });
    results.push(result);
    bucketLayouts[field] = targetVersion;
  }

  const optimizedFields = Object.entries(bucketLayouts)
    .filter(([_field, version]) => Number(version) > LEGACY_INDEX_BUCKET_LAYOUT_VERSION)
    .map(([field]) => field);

  await stateRepository.updateDatabaseMeta(paths, (currentMeta) => ({
    ...currentMeta,
    updatedAt: new Date().toISOString(),
    indexes: {
      ...(currentMeta?.indexes || {}),
      bucketLayoutVersion: resolveGlobalBucketLayoutVersion(bucketLayouts),
      bucketLayouts,
      optimizedFields,
    },
  }));

  console.log("Rebucket completed.");
  for (const result of results) {
    console.log(
      `${result.field}: changed=${result.changed} sourceBuckets=${result.bucketFiles} scannedEntries=${result.scannedEntries}`
    );
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  main().catch((error) => {
    console.error("Index rebucket failed.");
    console.error(error);
    process.exitCode = 1;
  });
}
