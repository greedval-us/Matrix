<script setup>
import { Search, LoaderCircle } from 'lucide-vue-next';
import { useSearchResults } from '../../composables/useSearchResults.js';
import { RESULT_PAGE_SIZE, formatResultCount } from '../../constants/resultPresentation.js';
import SearchResultsStatus from './SearchResultsStatus.vue';
import SearchSuggestions from './SearchSuggestions.vue';
import SearchSourceCard from './SearchSourceCard.vue';

const props = defineProps({ tabId: { type: Number, required: true } });
const { loading, error, meta, received, hasSearched, activeBase, bases, recordCount,
  suggestions, visibleCounts, notice, copied, savedSources, savingSources, fieldLabel,
  showMore, searchRelated, copyValue, saveNote, retry } = useSearchResults({ tabId: () => props.tabId });
</script>

<template>
  <div class="mx-page space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="mx-eyebrow mb-1.5">Выдача сервера</p>
        <h2 class="text-2xl font-semibold tracking-tight">Результаты поиска</h2>
        <p class="mt-1.5 text-sm text-matrix-muted">
          {{
            hasSearched
              ? 'Записи сгруппированы по источникам. Повторы внутри источника объединены.'
              : 'Совпадения появятся здесь после отправки запроса.'
          }}
        </p>
      </div>
      <span v-if="hasSearched" class="mx-badge">{{ formatResultCount(bases.length) }} источников</span>
    </header>
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
      class="mx-panel flex min-h-[300px] flex-col items-center justify-center px-6 text-center"
    >
      <span
        class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-matrix-border bg-matrix-raised"
        ><LoaderCircle
          aria-hidden="true"
          v-if="loading"
          class="h-6 w-6 animate-spin text-matrix-accent" /><Search
          aria-hidden="true"
          v-else
          class="h-6 w-6 text-matrix-accent"
      /></span>
      <h3 class="text-base font-medium">
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
