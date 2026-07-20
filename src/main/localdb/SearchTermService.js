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

  getBucketName(term) {
    const normalized = term.toLowerCase().replace(/[^a-zа-яё0-9]/giu, "");
    if (!normalized) return "__";
    return normalized.slice(0, 2).padEnd(2, "_");
  }

  getDocumentBucketName(docId) {
    const normalized = String(docId)
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]/giu, "");

    if (!normalized) return "__";
    return normalized.slice(0, 2).padEnd(2, "_");
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
