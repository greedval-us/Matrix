import { INDEXABLE_FIELDS, LEGACY_INDEX_BUCKET_LAYOUT_VERSION } from "./constants.js";

const DEFAULT_LAYOUTS = {
  default: {
    1: { prefixLength: 2 },
    2: { prefixLength: 3 },
  },
  number: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 2 },
  },
  mail: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  passport: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  inn: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  snils: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  telegram: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  vk: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  facebook: {
    1: { prefixLength: 2 },
    2: { prefixLength: 4 },
    3: { prefixLength: 4, hashLength: 1 },
  },
  fio: {
    1: { prefixLength: 2 },
    2: { prefixLength: 3 },
    3: { prefixLength: 4 },
  },
  date_of_birth: {
    1: { prefixLength: 2 },
    2: { prefixLength: 3 },
    3: { prefixLength: 4, hashLength: 1 },
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

export function buildRecommendedBucketLayoutMap() {
  return Object.fromEntries(
    INDEXABLE_FIELDS.map((field) => [field, getLatestBucketLayoutVersion(field)])
  );
}

export function resolveGlobalBucketLayoutVersion(bucketLayouts = {}) {
  const versions = Object.values(bucketLayouts).map((value) => Number(value));
  if (versions.length === 0) {
    return LEGACY_INDEX_BUCKET_LAYOUT_VERSION;
  }

  return Math.max(...versions);
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
