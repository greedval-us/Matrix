import { INDEXABLE_FIELDS, LEGACY_INDEX_BUCKET_LAYOUT_VERSION } from "./constants.js";

const DEFAULT_LAYOUTS = {
  default: {
    1: { prefixLength: 2 },
    2: { prefixLength: 3 },
  },
  number: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  mail: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  passport: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  inn: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  snils: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  telegram: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  vk: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
  facebook: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
  },
};

function getLayoutsForField(field) {
  return DEFAULT_LAYOUTS[field] || DEFAULT_LAYOUTS.default;
}

export function getBucketLayout(field, version = LEGACY_INDEX_BUCKET_LAYOUT_VERSION) {
  const layouts = getLayoutsForField(field);
  return (
    layouts[version] ||
    layouts[LEGACY_INDEX_BUCKET_LAYOUT_VERSION] ||
    DEFAULT_LAYOUTS.default[LEGACY_INDEX_BUCKET_LAYOUT_VERSION]
  );
}

export function getLatestBucketLayoutVersion(field) {
  const layouts = getLayoutsForField(field);
  return Math.max(...Object.keys(layouts).map((value) => Number(value)));
}

export function buildLegacyBucketLayoutMap() {
  return Object.fromEntries(
    INDEXABLE_FIELDS.map((field) => [field, LEGACY_INDEX_BUCKET_LAYOUT_VERSION])
  );
}

export function normalizeBucketLayoutMap(metaIndexes = {}) {
  const bucketLayouts = metaIndexes.bucketLayouts || {};
  const fallbackVersion = Number(
    metaIndexes.bucketLayoutVersion || LEGACY_INDEX_BUCKET_LAYOUT_VERSION
  );

  return Object.fromEntries(
    INDEXABLE_FIELDS.map((field) => [field, Number(bucketLayouts[field] || fallbackVersion)])
  );
}
