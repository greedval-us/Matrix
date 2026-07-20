import { INDEXABLE_FIELDS, LOCAL_DATABASE_FORMAT, LOCAL_DATABASE_VERSION } from "./constants.js";

export class LocalDatabaseMigrationService {
  constructor({ stateRepository }) {
    this.stateRepository = stateRepository;
  }

  async migrate(paths) {
    const meta = await this.stateRepository.readJson(paths.databaseMetaPath, null);
    if (!meta) {
      return { migrated: false, fromVersion: null, toVersion: null };
    }

    const currentVersion = Number(meta.version || 1);
    const normalizedMeta = this.normalizeMeta(meta);

    if (currentVersion === LOCAL_DATABASE_VERSION && this.isMetaNormalized(meta)) {
      return {
        migrated: false,
        fromVersion: currentVersion,
        toVersion: LOCAL_DATABASE_VERSION,
      };
    }

    await this.stateRepository.writeJson(paths.databaseMetaPath, normalizedMeta);

    return {
      migrated: true,
      fromVersion: currentVersion,
      toVersion: LOCAL_DATABASE_VERSION,
    };
  }

  normalizeMeta(meta) {
    const now = new Date().toISOString();

    return {
      format: LOCAL_DATABASE_FORMAT,
      version: LOCAL_DATABASE_VERSION,
      createdAt: meta.createdAt || now,
      updatedAt: meta.updatedAt || now,
      storage: {
        engine: meta.storage?.engine || "rocksdb",
        status: meta.storage?.status || "empty",
      },
      indexes: {
        version: LOCAL_DATABASE_VERSION,
        builtAt: meta.indexes?.builtAt || null,
        fields: Array.isArray(meta.indexes?.fields) ? meta.indexes.fields : INDEXABLE_FIELDS,
      },
    };
  }

  isMetaNormalized(meta) {
    return (
      meta.format === LOCAL_DATABASE_FORMAT &&
      meta.version === LOCAL_DATABASE_VERSION &&
      Array.isArray(meta.indexes?.fields) &&
      meta.storage?.engine
    );
  }
}
