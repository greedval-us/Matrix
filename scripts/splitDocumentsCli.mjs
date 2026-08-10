import path from "path";
import fs from "fs/promises";
import { EnsureLocalDatabaseReadyUseCase } from "../src/main/application/localdb/EnsureLocalDatabaseReadyUseCase.js";
import {
  DEFAULT_DATABASE_FOLDER_NAME,
  DEFAULT_DOCUMENT_SEGMENT_SIZE_BYTES,
} from "../src/main/localdb/constants.js";
import { JsonLinesRepository } from "../src/main/localdb/JsonLinesRepository.js";
import { LocalDatabaseMigrationService } from "../src/main/localdb/LocalDatabaseMigrationService.js";
import { LocalDatabasePaths } from "../src/main/localdb/LocalDatabasePaths.js";
import { LocalDatabaseStateRepository } from "../src/main/localdb/LocalDatabaseStateRepository.js";

const WRITE_BATCH_LINES = 500;
const SPLIT_STATE_FILE_NAME = "document_split_state.json";

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

  async getStatus(rootPath = this.getStoredRootPath()) {
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
      "  node scripts/splitDocumentsCli.mjs --db-root /path/to/MatrixData",
      "  node scripts/splitDocumentsCli.mjs --db-root /path/to/MatrixData --max-size-gb 2",
      "  node scripts/splitDocumentsCli.mjs --db-root /path/to/MatrixData --dry-run",
      "  node scripts/splitDocumentsCli.mjs --db-root /path/to/MatrixData --reset-state",
      "",
      "Example:",
      "  npm run documents:split -- --db-root /srv/data/MatrixData --max-size-gb 1",
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = {
    dbRoot: "",
    maxSizeGb: DEFAULT_DOCUMENT_SEGMENT_SIZE_BYTES / 1024 / 1024 / 1024,
    dryRun: false,
    resetState: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === "--db-root") {
      args.dbRoot = argv[index + 1] || "";
      index += 1;
      continue;
    }

    if (current === "--max-size-gb") {
      args.maxSizeGb = Number(argv[index + 1] || "");
      index += 1;
      continue;
    }

    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (current === "--reset-state") {
      args.resetState = true;
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

function buildSegmentName(fileName, segmentIndex) {
  const parsed = path.parse(fileName);
  const baseName = parsed.name.replace(/_part_\d{4}$/u, "");
  return `${baseName}_part_${String(segmentIndex).padStart(4, "0")}.jsonl`;
}

function getSplitStatePath(paths) {
  return path.join(paths.stateDir, SPLIT_STATE_FILE_NAME);
}

function createCancellationToken() {
  const token = {
    cancelled: false,
    reason: null,
  };

  const cancel = (signal) => {
    if (token.cancelled) return;
    token.cancelled = true;
    token.reason = signal;
    console.log(`Received ${signal}. Finishing current safe checkpoint before stopping...`);
  };

  const sigintHandler = () => cancel("SIGINT");
  const sigtermHandler = () => cancel("SIGTERM");
  process.on("SIGINT", sigintHandler);
  process.on("SIGTERM", sigtermHandler);

  return {
    token,
    dispose() {
      process.off("SIGINT", sigintHandler);
      process.off("SIGTERM", sigtermHandler);
    },
  };
}

function throwIfCancelled(token) {
  if (token?.cancelled) {
    const error = new Error(`Document split cancelled by ${token.reason || "signal"}.`);
    error.name = "DocumentSplitCancelledError";
    throw error;
  }
}

async function buildSplitPlan(jsonLinesRepository, paths, maxBytes) {
  const documentFiles = await jsonLinesRepository.listFiles(paths.documentsDir, ".jsonl");
  const plan = [];

  for (const fileName of documentFiles) {
    const filePath = paths.getDocumentPath(fileName);
    const stat = await jsonLinesRepository.stat(filePath);
    if (stat.size <= maxBytes) {
      continue;
    }

    plan.push({
      fileName,
      filePath,
      sizeBytes: stat.size,
      estimatedSegments: Math.ceil(stat.size / maxBytes),
    });
  }

  return plan;
}

async function invalidateIndexes({
  jsonLinesRepository,
  stateRepository,
  paths,
  invalidatedAt,
}) {
  const staleIndexesDir = paths.getTempPath(`indexes-stale-${invalidatedAt}`);

  if (await jsonLinesRepository.exists(paths.indexesDir)) {
    await jsonLinesRepository.remove(staleIndexesDir);
    await jsonLinesRepository.move(paths.indexesDir, staleIndexesDir);
  }

  await stateRepository.writeIndexState(paths, {
    status: "stale",
    invalidatedAt,
    reason: "documents-segmented",
    message: "Document files were split into segments. Rebuild indexes before searching.",
  });

  await stateRepository.updateDatabaseMeta(paths, (meta) => ({
    ...meta,
    updatedAt: invalidatedAt,
    indexes: {
      ...(meta?.indexes || {}),
      builtAt: null,
      invalidatedAt,
      invalidReason: "documents-segmented",
    },
  }));

  return staleIndexesDir;
}

async function splitDocumentFile({
  planEntry,
  jsonLinesRepository,
  paths,
  splitRunId,
  maxBytes,
  cancellationToken,
}) {
  const tempDir = paths.getTempPath(`documents-split-${splitRunId}-${encodeURIComponent(planEntry.fileName)}`);
  const backupDir = paths.getTempPath(`documents-backup-${splitRunId}`);
  const tempPartPaths = [];
  const finalPartNames = [];
  let activePartPath = null;
  let activePartBytes = 0;
  let activePartIndex = 0;
  let batchLines = [];
  let batchBytes = 0;

  await jsonLinesRepository.remove(tempDir);
  await jsonLinesRepository.ensureDirectory(tempDir);
  await jsonLinesRepository.ensureDirectory(backupDir);

  const ensurePart = () => {
    if (activePartPath) {
      return;
    }

    activePartIndex += 1;
    const partName = buildSegmentName(planEntry.fileName, activePartIndex);
    activePartPath = path.join(tempDir, partName);
    activePartBytes = 0;
    tempPartPaths.push(activePartPath);
    finalPartNames.push(partName);
  };

  const flushBatch = async () => {
    if (!batchLines.length) return;
    await jsonLinesRepository.appendLines(activePartPath, batchLines);
    activePartBytes += batchBytes;
    batchLines = [];
    batchBytes = 0;
  };

  const rotatePart = async () => {
    await flushBatch();
    activePartPath = null;
    activePartBytes = 0;
    ensurePart();
  };

  ensurePart();

  for await (const line of jsonLinesRepository.iterateLines(planEntry.filePath)) {
    throwIfCancelled(cancellationToken);
    const lineBytes = Buffer.byteLength(line, "utf8") + 1;
    const wouldExceedPart =
      activePartBytes > 0 &&
      activePartBytes + batchBytes + lineBytes > maxBytes;

    if (wouldExceedPart) {
      await rotatePart();
    }

    const wouldExceedWithBatch =
      batchBytes > 0 &&
      activePartBytes + batchBytes + lineBytes > maxBytes;
    if (wouldExceedWithBatch) {
      await flushBatch();
    }

    batchLines.push(line);
    batchBytes += lineBytes;

    if (batchLines.length >= WRITE_BATCH_LINES) {
      await flushBatch();
    }
  }

  await flushBatch();
  throwIfCancelled(cancellationToken);

  const backupPath = path.join(backupDir, planEntry.fileName);
  await jsonLinesRepository.move(planEntry.filePath, backupPath);

  for (let index = 0; index < tempPartPaths.length; index += 1) {
    await jsonLinesRepository.move(
      tempPartPaths[index],
      paths.getDocumentPath(finalPartNames[index])
    );
  }

  await jsonLinesRepository.remove(tempDir);

  return {
    originalFileName: planEntry.fileName,
    originalSizeBytes: planEntry.sizeBytes,
    backupPath,
    segmentNames: finalPartNames,
  };
}

async function loadSplitState(stateRepository, paths) {
  return await stateRepository.readJson(getSplitStatePath(paths), null);
}

async function writeSplitState(stateRepository, paths, state) {
  await stateRepository.writeJson(getSplitStatePath(paths), state);
}

async function removeSplitState(jsonLinesRepository, paths) {
  await jsonLinesRepository.remove(getSplitStatePath(paths));
}

function createInitialSplitState({ paths, maxBytes, splitRunId, plan }) {
  return {
    status: "running",
    rootPath: paths.rootPath,
    splitRunId,
    maxBytes,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    invalidatedAt: null,
    staleIndexesDir: null,
    completedFiles: [],
    currentFile: null,
    pendingFiles: plan.map((entry) => entry.fileName),
  };
}

function normalizeResumeState(resumeState, { paths, maxBytes }) {
  if (!resumeState) return null;
  if (!["running", "cancelled"].includes(resumeState.status)) return null;
  if (resumeState.rootPath !== paths.rootPath) return null;
  if (Number(resumeState.maxBytes) !== Number(maxBytes)) {
    throw new Error(
      "Existing split state uses a different max segment size. Use the same --max-size-gb or pass --reset-state."
    );
  }

  return {
    ...resumeState,
    completedFiles: Array.isArray(resumeState.completedFiles) ? resumeState.completedFiles : [],
    pendingFiles: Array.isArray(resumeState.pendingFiles) ? resumeState.pendingFiles : [],
    currentFile: resumeState.currentFile || null,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dbRoot) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  if (!Number.isFinite(args.maxSizeGb) || args.maxSizeGb <= 0) {
    throw new Error("The --max-size-gb value must be a positive number.");
  }

  const maxBytes = Math.floor(args.maxSizeGb * 1024 * 1024 * 1024);
  const localDatabaseService = new CliLocalDatabaseService(args.dbRoot);
  const jsonLinesRepository = new JsonLinesRepository();
  const stateRepository = new LocalDatabaseStateRepository();
  const { token: cancellationToken, dispose } = createCancellationToken();

  try {
    await localDatabaseService.ensureReady();
    const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
    const indexState = await stateRepository.readIndexState(paths);

    if (indexState?.status === "running") {
      throw new Error(
        "Index build is currently running. Wait for indexing to finish before splitting document files."
      );
    }

    if (args.resetState) {
      await removeSplitState(jsonLinesRepository, paths);
    }

    const plan = await buildSplitPlan(jsonLinesRepository, paths, maxBytes);
    const resumeState = normalizeResumeState(
      await loadSplitState(stateRepository, paths),
      { paths, maxBytes }
    );
    const completedFiles = new Set(resumeState?.completedFiles || []);
    const filteredPlan = plan.filter((entry) => !completedFiles.has(entry.fileName));

    if (filteredPlan.length === 0) {
      if (resumeState) {
        await removeSplitState(jsonLinesRepository, paths);
      }
      console.log(`No document files exceed ${formatBytes(maxBytes)}.`);
      return;
    }

    console.log(`Document split plan for: ${paths.rootPath}`);
    console.log(`Max segment size: ${formatBytes(maxBytes)}`);
    for (const entry of filteredPlan) {
      console.log(
        `${entry.fileName}: ${formatBytes(entry.sizeBytes)} -> about ${entry.estimatedSegments} segments`
      );
    }

    if (args.dryRun) {
      console.log("Dry run completed. No files were changed.");
      return;
    }

    const splitState =
      resumeState ||
      createInitialSplitState({
        paths,
        maxBytes,
        splitRunId: new Date().toISOString().replace(/[:.]/g, "-"),
        plan: filteredPlan,
      });

    if (resumeState) {
      console.log(
        `Resuming previous split run ${resumeState.splitRunId}. Completed files: ${resumeState.completedFiles.length}`
      );
    }

    if (!splitState.staleIndexesDir) {
      const staleIndexesDir = await invalidateIndexes({
        jsonLinesRepository,
        stateRepository,
        paths,
        invalidatedAt: splitState.splitRunId,
      });
      splitState.invalidatedAt = splitState.splitRunId;
      splitState.staleIndexesDir = staleIndexesDir;
      splitState.updatedAt = new Date().toISOString();
      await writeSplitState(stateRepository, paths, splitState);
    }

    const results = [];

    for (const entry of filteredPlan) {
      throwIfCancelled(cancellationToken);
      splitState.currentFile = entry.fileName;
      splitState.pendingFiles = filteredPlan
        .map((item) => item.fileName)
        .filter((fileName) => !splitState.completedFiles.includes(fileName));
      splitState.updatedAt = new Date().toISOString();
      await writeSplitState(stateRepository, paths, splitState);

      console.log(`Splitting ${entry.fileName}...`);
      const result = await splitDocumentFile({
        planEntry: entry,
        jsonLinesRepository,
        paths,
        splitRunId: splitState.splitRunId,
        maxBytes,
        cancellationToken,
      });
      results.push(result);
      splitState.completedFiles.push(entry.fileName);
      splitState.currentFile = null;
      splitState.pendingFiles = splitState.pendingFiles.filter(
        (fileName) => fileName !== entry.fileName
      );
      splitState.updatedAt = new Date().toISOString();
      await writeSplitState(stateRepository, paths, splitState);
      console.log(
        `Created ${result.segmentNames.length} segments from ${result.originalFileName}`
      );
    }

    splitState.status = "completed";
    splitState.currentFile = null;
    splitState.pendingFiles = [];
    splitState.updatedAt = new Date().toISOString();
    await writeSplitState(stateRepository, paths, splitState);
    await removeSplitState(jsonLinesRepository, paths);

    console.log("Document split completed.");
    console.log(`Invalidated indexes backup: ${splitState.staleIndexesDir}`);
    console.log("Rebuild indexes before running search again.");
  } catch (error) {
    if (error?.name === "DocumentSplitCancelledError") {
      const paths = new LocalDatabasePaths(localDatabaseService.getStoredRootPath());
      const splitState = await loadSplitState(stateRepository, paths);
      if (splitState) {
        splitState.status = "cancelled";
        splitState.updatedAt = new Date().toISOString();
        await writeSplitState(stateRepository, paths, splitState);
      }
      console.log("Document split paused safely. Run the same command again to continue.");
      return;
    }

    throw error;
  } finally {
    dispose();
  }
}

main().catch((error) => {
  console.error("Document split failed.");
  console.error(error);
  process.exitCode = 1;
});
