<script setup>
import { Search, LoaderCircle } from 'lucide-vue-next';
import { useSearchResults } from '../../composables/useSearchResults.js';
import { RESULT_PAGE_SIZE, formatResultCount } from '../../constants/resultPresentation.js';
import SearchResultsStatus from './SearchResultsStatus.vue';
import SearchSuggestions from './SearchSuggestions.vue';
import SearchSourceCard from './SearchSourceCard.vue';
import ReportPanel from '../report/ReportPanel.vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI.js';
import { computed } from 'vue';

const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const reportState = computed(() => searchUI.getReportState(props.tabId));
const { loading, error, meta, received, hasSearched, activeBase, bases, recordCount,
  suggestions, visibleCounts, notice, copied, savedSources, savingSources, fieldLabel,
  showMore, searchRelated, copyValue, saveNote, retry } = useSearchResults({ tabId: () => props.tabId });
</script>

<template>
  <div class="mx-page search-results-page space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-[26px] font-semibold tracking-tight">Результаты поиска</h2>
        <p class="mt-1.5 max-w-xl text-sm leading-6 text-matrix-muted">
          {{
            hasSearched
              ? 'Совпадения сгруппированы по источникам.'
              : 'Совпадения появятся здесь после отправки запроса.'
          }}
        </p>
      </div>
      <span v-if="hasSearched" class="mx-badge mt-1">{{ formatResultCount(bases.length) }} источников</span>
    </header>
    <ReportPanel v-if="reportState" :state="reportState"
      @cancel="searchUI.cancelReport(tabId)" @save="searchUI.saveCollectedReport(tabId)" />
    <SearchResultsStatus
      :has-searched="hasSearched" :loading="loading" :meta="meta" :error="error"
      :received="received" :record-count="recordCount" @retry="retry"
    />
    <p v-if="notice" role="alert" class="mx-alert text-sm">{{ notice }}</p>
    <SearchSuggestions
      v-if="!loading && suggestions.length" :suggestions="suggestions"
      :field-label="fieldLabel" @search="searchRelated"
    />
    <div
      v-if="!bases.length && !error"
      class="search-results-empty flex min-h-[380px] flex-col items-center justify-center rounded-3xl px-6 py-12 text-center"
    >
      <span
        class="search-empty-icon mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[22px]"
        ><LoaderCircle
          aria-hidden="true"
          v-if="loading"
          class="h-7 w-7 animate-spin text-matrix-accent" /><Search
          aria-hidden="true"
          v-else
          class="h-7 w-7 text-matrix-accent"
      /></span>
      <h3 class="text-lg font-semibold tracking-tight">
        {{
          loading
            ? 'Ищем совпадения'
            : !hasSearched
              ? 'Начните с первого запроса'
              : meta?.cancelled
                ? 'Поиск остановлен'
                : 'Совпадений не найдено'
        }}
      </h3>
      <p class="mt-2 max-w-sm text-sm leading-6 text-matrix-muted">
        {{
          loading
            ? 'Результаты будут появляться по мере получения.'
            : !hasSearched
              ? 'Выберите тип данных слева, заполните поле и нажмите «Найти совпадения».'
              : 'Измените параметры поиска или проверьте доступность данных на сервере.'
        }}
      </p>
    </div>
    <SearchSourceCard
      v-for="base in bases" :key="base.source" :base="base"
      :active="activeBase === base.name" :saved="savedSources.has(base.source)"
      :saving="savingSources.has(base.source)" :copied="copied"
      :visible-count="visibleCounts[base.source] || RESULT_PAGE_SIZE" :field-label="fieldLabel"
      @save="saveNote" @copy="copyValue" @show-more="showMore"
    />
  </div>
</template>

<style scoped>
.search-results-page { max-width: 1100px; margin: 0 auto; }
.search-results-empty { background: rgb(var(--mx-panel-rgb) / 0.38); }
.search-empty-icon {
  background: rgb(var(--mx-accent-rgb) / 0.08);
  border: 1px solid rgb(var(--mx-accent-rgb) / 0.08);
}
</style>
