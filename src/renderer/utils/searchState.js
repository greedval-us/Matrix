import { shallowReactive } from 'vue';

export function createSearchResultState() {
  return { results: shallowReactive([]), error: '', meta: null, received: 0, hasSearched: false };
}
export function createSearchState(searchValue = '') {
  return { selectedFields: {}, collapsedFields: {}, ...createSearchResultState(), loading: false, searchValue };
}
