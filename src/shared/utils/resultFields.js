export function nonEmptyResultFields(fields) {
  return (fields ?? []).filter(([, value]) => value != null && (typeof value !== 'string' || value.trim() !== ''));
}
