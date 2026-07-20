import fs from "fs/promises";
import path from "path";
import Store from "electron-store";

const STORAGE_KEY = "databaseRootPath";
const DEFAULT_DATABASE_FOLDER_NAME = "MatrixData";

export class LocalDatabaseService {
  constructor() {
    this.store = new Store();
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

    const directories = [
      normalizedRootPath,
      path.join(normalizedRootPath, "documents"),
      path.join(normalizedRootPath, "indexes"),
      path.join(normalizedRootPath, "state"),
      path.join(normalizedRootPath, "meta"),
      path.join(normalizedRootPath, "temp"),
    ];

    for (const directory of directories) {
      await fs.mkdir(directory, { recursive: true });
    }

    const now = new Date().toISOString();
    const meta = {
      format: "matrix-local-db",
      version: 1,
      createdAt: now,
      updatedAt: now,
      storage: {
        engine: "rocksdb",
        status: "empty",
      },
      indexes: {
        version: 1,
        fields: [
          "number",
          "mail",
          "fio",
          "passport",
          "inn",
          "snils",
          "telegram",
          "vk",
          "facebook",
          "grz",
          "vin",
          "date_of_birth",
        ],
      },
    };

    const metaPath = path.join(normalizedRootPath, "meta", "db.json");
    const readmePath = path.join(normalizedRootPath, "README.txt");
    const statePath = path.join(normalizedRootPath, "state", "index_state.json");

    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), "utf8");
    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          lastIndexedSource: null,
          indexedDocuments: 0,
          updatedAt: now,
        },
        null,
        2
      ),
      "utf8"
    );
    await fs.writeFile(
      readmePath,
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
}
