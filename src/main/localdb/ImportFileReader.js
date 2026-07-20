import fs from "fs/promises";
import { JsonLinesRepository } from "./JsonLinesRepository.js";
import { MAX_IMPORT_FILE_SIZE_BYTES } from "./constants.js";
import { localDbMessages } from "./messages.js";

export class ImportFileReader {
  constructor({
    jsonLinesRepository = new JsonLinesRepository(),
    maxFileSizeBytes = MAX_IMPORT_FILE_SIZE_BYTES,
  } = {}) {
    this.jsonLinesRepository = jsonLinesRepository;
    this.maxFileSizeBytes = maxFileSizeBytes;
  }

  async *iterateRecords(filePath) {
    const stat = await fs.stat(filePath);
    if (stat.size > this.maxFileSizeBytes) {
      throw new Error(localDbMessages.importFileTooLarge(filePath, this.maxFileSizeBytes));
    }

    const firstChar = await this.jsonLinesRepository.readFirstNonWhitespaceChar(filePath);
    if (firstChar === null) {
      return;
    }

    if (firstChar !== "[" && firstChar !== "{") {
      yield* this.iterateNdjson(filePath);
      return;
    }

    const fileContent = await fs.readFile(filePath, "utf8");
    const trimmedContent = fileContent.trim();
    if (!trimmedContent) {
      return;
    }

    try {
      const parsed = JSON.parse(trimmedContent);
      const records = Array.isArray(parsed) ? parsed : [parsed];

      for (const record of records) {
        yield record;
      }

      return;
    } catch {
      const normalizedContent = `[${trimmedContent.replace(/\}\s*\{/g, "},{")}]`;
      const parsed = JSON.parse(normalizedContent);
      const records = Array.isArray(parsed) ? parsed : [parsed];

      for (const record of records) {
        yield record;
      }
    }
  }

  async *iterateNdjson(filePath) {
    for await (const line of this.jsonLinesRepository.iterateLines(filePath)) {
      yield JSON.parse(line);
    }
  }
}
