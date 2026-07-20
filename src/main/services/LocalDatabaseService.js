import fs from "fs/promises";
import path from "path";
import Store from "electron-store";
import { LocalDatabasePaths } from "../localdb/LocalDatabasePaths.js";
import {
  DEFAULT_DATABASE_FOLDER_NAME,
  STORAGE_KEY,
} from "../localdb/constants.js";
import { LocalDatabaseMigrationService } from "../localdb/LocalDatabaseMigrationService.js";
import { LocalDatabaseStateRepository } from "../localdb/LocalDatabaseStateRepository.js";
import { EnsureLocalDatabaseReadyUseCase } from "../application/localdb/EnsureLocalDatabaseReadyUseCase.js";

export class LocalDatabaseService {
  constructor() {
    this.store = new Store();
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
    return this.normalizeRootPath(this.store.get(STORAGE_KEY) || "");
  }

  setStoredRootPath(rootPath) {
    const normalizedRootPath = this.normalizeRootPath(rootPath);
    this.store.set(STORAGE_KEY, normalizedRootPath);
    return normalizedRootPath;
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

  async initialize(rootPath) {
    const normalizedRootPath = this.normalizeRootPath(rootPath);

    if (!normalizedRootPath) {
      throw new Error("Database root path is required");
    }

    const paths = new LocalDatabasePaths(normalizedRootPath);
    const directories = [
      normalizedRootPath,
      paths.documentsDir,
      paths.indexesDir,
      paths.stateDir,
      paths.metaDir,
      paths.tempDir,
    ];

    for (const directory of directories) {
      await fs.mkdir(directory, { recursive: true });
    }

    const now = new Date().toISOString();
    await this.stateRepository.writeJson(
      paths.databaseMetaPath,
      this.stateRepository.buildDatabaseMeta(now)
    );
    await this.stateRepository.writeJson(
      paths.indexStatePath,
      this.stateRepository.buildInitialIndexState(now)
    );
    await fs.writeFile(
      paths.readmePath,
      [
        "Matrix local database storage",
        "",
        "documents/ - full records storage",
        "indexes/   - search indexes",
        "meta/      - database metadata",
        "state/     - indexing state",
        "temp/      - temporary import files",
      ].join("\n"),
      "utf8"
    );

    this.setStoredRootPath(normalizedRootPath);

    return await this.getStatus(normalizedRootPath);
  }

  async ensureReady(rootPath = this.getStoredRootPath()) {
    return await this.ensureReadyUseCase.execute(rootPath);
  }
}
