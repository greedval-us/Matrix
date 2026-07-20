import fs from "fs/promises";
import path from "path";
import { localDbMessages } from "./messages.js";

export class LocalDatabaseGuard {
  async resolveDirectory(inputPath) {
    if (!inputPath) {
      throw new Error(localDbMessages.pathRequired);
    }

    const normalizedPath = path.resolve(inputPath);
    const stat = await fs.stat(normalizedPath);

    if (!stat.isDirectory()) {
      throw new Error(`Expected a directory: ${normalizedPath}`);
    }

    return normalizedPath;
  }

  async assertImportSourceAllowed(databaseRootPath, sourceFolderPath) {
    const resolvedDatabaseRoot = await this.resolveDirectory(databaseRootPath);
    const resolvedSourceFolder = await this.resolveDirectory(sourceFolderPath);
    const relativePath = path.relative(resolvedDatabaseRoot, resolvedSourceFolder);
    const sourceInsideDatabase =
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));

    if (sourceInsideDatabase) {
      throw new Error(localDbMessages.importSourceInsideDatabase);
    }

    return {
      databaseRootPath: resolvedDatabaseRoot,
      sourceFolderPath: resolvedSourceFolder,
    };
  }
}
