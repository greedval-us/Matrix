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

  async *iterateJson(filePath) {
    for await (const line of this.iterateLines(filePath)) {
      yield JSON.parse(line);
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
}
