import { SEARCHABLE_KEYS } from "./constants.js";
import { SearchTermService } from "./SearchTermService.js";

export class ImportedDocumentFactory {
  constructor(termService = new SearchTermService()) {
    this.termService = termService;
  }

  createDocument(record, sourceTable, sequenceNumber, importedAt) {
    const raw = { ...record };
    const normalized = { ...record };

    if (!Object.prototype.hasOwnProperty.call(normalized, "fio")) {
      const fioParts = [normalized.surname, normalized.name, normalized.patronymic]
        .filter(Boolean)
        .map((part) => String(part).trim())
        .filter(Boolean);

      if (fioParts.length > 0) {
        normalized.fio = fioParts.join(" ");
      }
    }

    delete normalized.surname;
    delete normalized.name;
    delete normalized.patronymic;

    if (typeof normalized.date_of_birth === "string") {
      normalized.date_of_birth =
        this.termService.formatDateOfBirth(normalized.date_of_birth) ||
        normalized.date_of_birth;
    }

    const fields = {};
    const invalidFields = {};

    for (const [key, value] of Object.entries(normalized)) {
      if (value === null || value === undefined || value === "") continue;

      if (SEARCHABLE_KEYS.includes(key)) {
        const { valid, cleanValue, invalidValue } = this.validateField(key, value);
        if (valid && cleanValue) {
          fields[key] = cleanValue;
        } else if (invalidValue) {
          invalidFields[`no_valid_${key}`] = invalidValue;
        }
      } else {
        fields[key] = typeof value === "string" ? value.trim() : value;
      }
    }

    if (fields.fio) {
      fields.fio = String(fields.fio).trim().toUpperCase();
    }

    const docRowId = raw.id ?? sequenceNumber;

    return {
      docId: `${sourceTable}:${docRowId}`,
      sourceTable,
      rowId: docRowId,
      importedAt,
      fields,
      invalidFields,
      raw,
    };
  }

  validateField(key, value) {
    const stringValue = String(value).trim();
    if (!stringValue) {
      return { valid: false, cleanValue: null, invalidValue: null };
    }

    switch (key) {
      case "number": {
        const normalized = stringValue.replace(/[^\d]/g, "");
        return normalized.length >= 9 && normalized.length <= 14
          ? { valid: true, cleanValue: normalized, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      }
      case "snils":
        return /^\d{11}$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "inn":
        return /^\d{10}(\d{2})?$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "passport":
        return /^\d{10}$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "mail":
        return /^[^ @]+@[^ @]+\.[^ @]+$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue.toLowerCase(), invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "fio":
        return this.isValidFio(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      case "date_of_birth": {
        const formatted = this.termService.formatDateOfBirth(stringValue);
        return formatted
          ? { valid: true, cleanValue: formatted, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      }
      case "telegram":
      case "facebook":
      case "imei":
      case "imsi":
      case "vk":
        return /^\d+$/.test(stringValue)
          ? { valid: true, cleanValue: stringValue, invalidValue: null }
          : { valid: false, cleanValue: null, invalidValue: stringValue };
      default:
        return { valid: true, cleanValue: stringValue, invalidValue: null };
    }
  }

  isValidFio(value) {
    const compactValue = value.replace(/[\s\xA0]+/gu, "");
    if (!compactValue) return false;
    if (value.trim().split(/\s+/).length < 2) return false;
    return /^[a-zA-Zа-яА-ЯёЁйЙъЪьЬіІїЇєЄґҐ-]+$/u.test(compactValue);
  }
}
