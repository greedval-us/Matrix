import { createHash } from "node:crypto";
import { getBucketLayout } from "./indexBucketLayouts.js";

const INDEX_BUCKET_HASH_SEPARATOR = "~";

export class SearchTermService {
  formatDateOfBirth(date) {
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(date)) return date;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) return date.replace(/\//g, ".");
    if (/^\d{2}-\d{2}-\d{4}$/.test(date)) return date.replace(/-/g, ".");
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split("-");
      return `${day}.${month}.${year}`;
    }

    return null;
  }

  normalizeIndexTerm(field, value) {
    const stringValue = String(value).trim();
    if (!stringValue) return null;

    switch (field) {
      case "number":
      case "passport":
      case "inn":
      case "snils":
      case "telegram":
      case "vk":
      case "facebook":
      case "imei":
      case "imsi":
        return stringValue.replace(/[^\d]/g, "");
      case "mail":
        return stringValue.toLowerCase();
      case "fio":
        return stringValue.toUpperCase().replace(/\s+/g, " ").trim();
      case "vin":
      case "grz":
        return stringValue.toUpperCase().replace(/\s+/g, "");
      case "date_of_birth":
        return this.formatDateOfBirth(stringValue) || stringValue;
      default:
        return stringValue;
    }
  }

  extractFallbackIndexTerms(field, value) {
    const stringValue = String(value).trim();
    if (!stringValue) return [];

    switch (field) {
      case "number":
        return [...new Set((stringValue.match(/\d{9,14}/g) || []).map((item) => item.trim()))];
      default: {
        const normalized = this.normalizeIndexTerm(field, stringValue);
        return normalized ? [normalized] : [];
      }
    }
  }

  normalizeQueryTerm(field, value) {
    const stringValue = String(value).trim();
    if (!stringValue) return null;

    switch (field) {
      case "number":
      case "passport":
      case "inn":
      case "snils":
      case "telegram":
      case "vk":
      case "facebook":
        return stringValue.replace(/[^\d?%]/g, "");
      case "mail":
        return stringValue.toLowerCase();
      case "fio":
        return stringValue.toUpperCase().replace(/\s+/g, " ").trim();
      case "vin":
      case "grz":
        return stringValue.toUpperCase().replace(/\s+/g, "");
      case "date_of_birth":
        return this.formatDateOfBirth(stringValue) || stringValue;
      default:
        return stringValue;
    }
  }

  buildQueryTerm(field, value) {
    const normalizedTerm = this.normalizeQueryTerm(field, value);
    if (!normalizedTerm) return null;

    if (field !== "fio" || this.hasWildcards(normalizedTerm)) {
      return normalizedTerm;
    }

    const parts = normalizedTerm.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;

    return `${parts.join("%")}%`;
  }

  normalizeBucketTerm(field, term) {
    const stringValue = String(term).trim();
    if (!stringValue) return "";

    if (field === "number") {
      return stringValue.replace(/[^\d]/g, "");
    }

    return stringValue.toLowerCase().replace(/[^a-zР°-СЏС‘0-9]/giu, "");
  }

  getIndexBucketName(field, term, bucketLayoutVersion = 1) {
    const normalized = this.normalizeBucketTerm(field, term);
    const { prefixLength, hashLength = 0 } = getBucketLayout(field, bucketLayoutVersion);
    if (!normalized) {
      return "_".repeat(prefixLength);
    }

    const prefix = normalized.slice(0, prefixLength).padEnd(prefixLength, "_");
    if (hashLength <= 0) {
      return prefix;
    }

    const hashSuffix = createHash("md5")
      .update(`${field}:${normalized}`, "utf8")
      .digest("hex")
      .slice(0, hashLength);

    return `${prefix}${INDEX_BUCKET_HASH_SEPARATOR}${hashSuffix}`;
  }

  getIndexBucketPrefix(field, term, bucketLayoutVersion = 1) {
    const normalized = this.normalizeBucketTerm(field, term);
    const { prefixLength } = getBucketLayout(field, bucketLayoutVersion);
    if (!normalized) {
      return "_".repeat(prefixLength);
    }

    return normalized.slice(0, prefixLength).padEnd(prefixLength, "_");
  }

  matchesWildcardBucketName(field, bucketName, normalizedPrefix, bucketLayoutVersion = 1) {
    const { prefixLength, hashLength = 0 } = getBucketLayout(field, bucketLayoutVersion);
    if (!normalizedPrefix) {
      return true;
    }

    if (normalizedPrefix.length >= prefixLength) {
      const bucketPrefix = this.getIndexBucketPrefix(field, normalizedPrefix, bucketLayoutVersion);
      if (hashLength <= 0) {
        return bucketName === bucketPrefix;
      }

      return (
        bucketName === bucketPrefix ||
        bucketName.startsWith(`${bucketPrefix}${INDEX_BUCKET_HASH_SEPARATOR}`)
      );
    }

    return bucketName.startsWith(normalizedPrefix);
  }

  getBucketName(term) {
    const normalized = String(term)
      .toLowerCase()
      .replace(/[^a-zР°-СЏС‘0-9]/giu, "");
    if (!normalized) return "__";
    return normalized.slice(0, 2).padEnd(2, "_");
  }

  getDocumentBucketName(docId) {
    const stringValue = String(docId).trim();
    if (!stringValue) return "___";
    return createHash("md5").update(stringValue, "utf8").digest("hex").slice(0, 3);
  }

  hasWildcards(term) {
    return term.includes("?") || term.includes("%");
  }

  getWildcardPrefix(term) {
    const match = term.match(/^[^?%]+/);
    return match ? match[0] : "";
  }

  buildWildcardRegex(term) {
    const escaped = term.replace(/[.*+^${}()|[\]\\]/g, "\\$&");
    const pattern = escaped.replace(/%/g, ".*").replace(/\?/g, ".");
    return new RegExp(`^${pattern}$`, "u");
  }
}
