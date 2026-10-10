export function createSearchResultState() {
  return { results: [], error: '', meta: null, received: 0, hasSearched: false };
}
export function createSearchState(searchValue = '') {
  return { selectedFields: {}, collapsedFields: {}, ...createSearchResultState(), loading: false, searchValue };
}
