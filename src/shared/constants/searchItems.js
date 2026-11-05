const definitions = [
  ["fio", "ФИО", "^[A-Za-zА-Яа-яЁё-]+(?:\\s+[A-Za-zА-Яа-яЁё-]+)*$", "Иванов Иван Иванович", /^[A-Za-zА-Яа-яЁё\s?%-]+$/],
  ["date_of_birth", "Дата рождения", "^(0?[1-9]|[12][0-9]|3[01])\\.(0?[1-9]|1[0-2])\\.(19\\d{2}|20[0-3]\\d|2040)$", "31.12.1990", /^[0-9.?%]+$/],
  ["number", "Телефон", "^\\d{8,15}$", "8-15 цифр без +, пробелов и скобок", /^[0-9?%]+$/],
  ["mail", "Email", "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", "name@example.com", /^\S+$/],
  ["passport", "Паспорт", "^\\d{10}$", "1234567890 (10 цифр)", /^[0-9?%]+$/],
  ["inn", "ИНН", "^(?:\\d{9}|\\d{10}|\\d{12})$", "1234567890 (9, 10 или 12 цифр)", /^[0-9?%]+$/],
  ["snils", "СНИЛС", "^\\d{11}$", "12345678901 (11 цифр)", /^[0-9?%]+$/],
  ["telegram", "Telegram ID", "^\\d{5,20}$", "123456789", /^[0-9?%]+$/],
  ["vk", "VK ID", "^\\d{5,20}$", "123456789", /^[0-9?%]+$/],
  ["facebook", "Facebook ID", "^[a-zA-Z0-9.]{5,50}$", "123456789", /^[A-Za-z0-9.?%]+$/],
  ["imei", "IMEI", "^\\d{15}$", "123456789012345 (15 цифр)", /^[0-9?%]+$/],
  ["imsi", "IMSI", "^\\d{14,15}$", "250011234567890 (14-15 цифр)", /^[0-9?%]+$/],
  ["grz", "ГРЗ", "^(?:[ABEKMHOPCTYXАВЕКМНОРСТУХ]\\d{3}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2}|\\d{4}[ABEKMHOPCTYXАВЕКМНОРСТУХ]{2})$", "A123BC или 1234AB", /^[ABEKMHOPCTYXАВЕКМНОРСТУХ0-9?%]+$/i],
  ["vin", "VIN", "^[A-HJ-NPR-Z0-9]{17}$", "XTA210990Y2765432 (17 символов)", /^[A-HJ-NPR-Z0-9?%]+$/i],
];
export const DEFAULT_SEARCH_FIELD = 'number';
export const MIN_WILDCARD_LITERAL_LENGTH = 3;
export const SEARCH_FIELDS = Object.freeze(definitions.map(([type, label, pattern, placeholder, wildcardPattern]) => Object.freeze({ type, label, pattern, placeholder, wildcardPattern })));
export const SEARCH_FIELD_IDS = Object.freeze(SEARCH_FIELDS.map(({ type }) => type));
export const PRIMARY_SEARCH_FIELD_IDS = Object.freeze(['fio', 'date_of_birth', 'number', 'mail']);
const fieldsByType = new Map(SEARCH_FIELDS.map((field) => [field.type, field]));
export const getSearchField = (type) => fieldsByType.get(type);
// Preserve the existing pattern/placeholder lookup contract.
export const defaultPatterns = Object.freeze(Object.fromEntries(SEARCH_FIELDS.map(({ type, pattern }) => [type, pattern])));
export const defaultPlaceholders = Object.freeze(Object.fromEntries(SEARCH_FIELDS.map(({ type, placeholder }) => [type, placeholder])));
