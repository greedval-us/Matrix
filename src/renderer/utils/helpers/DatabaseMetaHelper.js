const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function processAndGroupMeta(data = []) {
  const processed = (Array.isArray(data) ? data : [])
    .map((item, index) => normalizeMetaItem(item, index))
    .filter(Boolean)
    .sort((left, right) => right.timestamp - left.timestamp);

  if (processed.length === 0) {
    return {};
  }

  const grouped = {};

  for (const item of processed) {
    const yearKey = String(item.year);
    const monthKey = MONTH_NAMES[item.month - 1] || "Без месяца";

    if (!grouped[yearKey]) grouped[yearKey] = {};
    if (!grouped[yearKey][monthKey]) grouped[yearKey][monthKey] = [];

    grouped[yearKey][monthKey].push(item);
  }

  return grouped;
}

function normalizeMetaItem(item, index) {
  const parsedDate = parseMetaDate(
    item?.updated_at ||
      item?.created_at ||
      item?.updatedAt ||
      item?.createdAt ||
      item?.importedAt ||
      item?.relevance_date
  );

  if (!parsedDate) return null;

  return {
    ...item,
    id: item?.id ?? item?.name_table ?? item?.sourceTable ?? index,
    name: item?.name || item?.name_table || item?.sourceTable || "Без названия",
    type: item?.type || "local-import",
    count: normalizeCount(item?.count),
    year: parsedDate.year,
    month: parsedDate.month,
    day: parsedDate.day,
    timestamp: parsedDate.date.getTime(),
    formattedDate: parsedDate.formattedDate,
  };
}

function normalizeCount(value) {
  const count = Number.parseInt(value, 10);
  return Number.isFinite(count) ? count.toLocaleString("ru-RU") : "0";
}

function parseMetaDate(value) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return buildDateParts(new Date(value));
  }

  const text = String(value).trim();
  if (!text) return null;

  const directDate = new Date(text);
  if (!Number.isNaN(directDate.getTime())) {
    return buildDateParts(directDate);
  }

  const dottedMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dottedMatch) {
    const [, day, month, year] = dottedMatch;
    return buildDateParts(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  const sqlMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (sqlMatch) {
    const [, year, month, day] = sqlMatch;
    return buildDateParts(new Date(Number(year), Number(month) - 1, Number(day)));
  }

  return null;
}

function buildDateParts(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return {
    date,
    day: Number(day),
    month: Number(month),
    year,
    formattedDate: `${day}.${month}.${year}`,
  };
}
