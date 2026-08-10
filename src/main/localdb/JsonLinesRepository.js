import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import readline from "readline";

export class JsonLinesRepository {
  async ensureDirectory(directoryPath) {
    await fsPromises.mkdir(directoryPath, { recursive: true });
  }

  async appendLines(filePath, lines) {
    if (!lines.length) return;

    await this.ensureDirectory(path.dirname(filePath));
    await fsPromises.appendFile(filePath, `${lines.join("\n")}\n`, "utf8");
  }

  async exists(targetPath) {
    try {
      await fsPromises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }

  async remove(targetPath) {
    await fsPromises.rm(targetPath, { recursive: true, force: true });
  }

  async move(sourcePath, targetPath) {
    await this.ensureDirectory(path.dirname(targetPath));
    await fsPromises.rename(sourcePath, targetPath);
  }

  async copy(sourcePath, targetPath) {
    await this.ensureDirectory(path.dirname(targetPath));
    await fsPromises.cp(sourcePath, targetPath, { recursive: true, force: true });
  }

  async stat(targetPath) {
    return await fsPromises.stat(targetPath);
  }

  async readFirstNonWhitespaceChar(filePath, bytesToRead = 4096) {
    const handle = await fsPromises.open(filePath, "r");

    try {
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
      const content = buffer.toString("utf8", 0, bytesRead);

      for (const char of content) {
        if (!/\s/u.test(char)) {
          return char;
        }
      }

      return null;
    } finally {
      await handle.close();
    }
  }

  async *iterateLines(filePath) {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const reader = readline.createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    try {
      for await (const line of reader) {
        if (!line.trim()) continue;
        yield line;
      }
    } finally {
      reader.close();
      stream.close();
    }
  }

  async *iterateLinesWithMetadata(filePath) {
    let byteOffset = 0;

    for await (const line of this.iterateLines(filePath)) {
      const byteLength = Buffer.byteLength(line, "utf8");
      yield {
        line,
        byteOffset,
        byteLength,
      };
      // Compact lookup stores offsets against JSONL files written by appendLines(),
      // which always separates records with a single "\n" byte.
      byteOffset += byteLength + 1;
    }
  }

  async *iterateJson(filePath) {
    for await (const line of this.iterateLines(filePath)) {
      yield JSON.parse(line);
    }
  }

  async *iterateJsonWithMetadata(filePath) {
    for await (const entry of this.iterateLinesWithMetadata(filePath)) {
      yield {
        ...entry,
        value: JSON.parse(entry.line),
      };
    }
  }

  async readChunk(filePath, byteOffset, byteLength) {
    const handle = await fsPromises.open(filePath, "r");

    try {
      const buffer = Buffer.alloc(byteLength);
      const { bytesRead } = await handle.read(buffer, 0, byteLength, byteOffset);
      return buffer.toString("utf8", 0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async readChunks(filePath, chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return [];
    }

    const handle = await fsPromises.open(filePath, "r");

    try {
      const results = [];
      for (const chunk of chunks) {
        const byteOffset = Number(chunk?.byteOffset);
        const byteLength = Number(chunk?.byteLength);
        const buffer = Buffer.alloc(byteLength);
        const { bytesRead } = await handle.read(buffer, 0, byteLength, byteOffset);
        results.push(buffer.toString("utf8", 0, bytesRead));
      }

      return results;
    } finally {
      await handle.close();
    }
  }

  async countLines(filePath) {
    let count = 0;

    for await (const _line of this.iterateLines(filePath)) {
      count += 1;
    }

    return count;
  }

  async listFiles(directoryPath, extension) {
    const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension)
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  }

  async listFilesRecursive(directoryPath, extension) {
    const results = [];

    const walk = async (currentPath, relativeBase = "") => {
      const entries = await fsPromises.readdir(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        const relativePath = relativeBase ? path.join(relativeBase, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await walk(entryPath, relativePath);
          continue;
        }

        if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) {
          results.push(relativePath);
        }
      }
    };

    await walk(directoryPath);
    return results.sort((left, right) => left.localeCompare(right));
  }
}
