<script setup>
import { computed, shallowReactive, shallowRef, useTemplateRef, watch } from 'vue';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/vue-virtual';
import { Search, LoaderCircle } from 'lucide-vue-next';
import { formatResultCount } from '../../constants/resultPresentation.js';
import SearchResultsStatus from './SearchResultsStatus.vue';
import SearchSuggestions from './SearchSuggestions.vue';
import SearchSourceCard from './SearchSourceCard.vue';
import ReportPanel from '../report/ReportPanel.vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI.js';

const RECORDS_PER_BLOCK = 6;
const props = defineProps({
  tabId: { type: Number, required: true },
  state: { type: Object, required: true },
  viewport: Object,
  scrollLead: Object,
});
const searchUI = useSearchUIStore();
const reportState = computed(() => searchUI.getReportState(props.tabId));
const { results, loading, error, meta, received, hasSearched, activeBase, bases, recordCount,
  suggestions, notice, copied, savedSources, savingSources, fieldLabel,
  searchRelated, copyValue, saveNote, retry } = props.state;
const intro = useTemplateRef('intro');
const list = useTemplateRef('list');
const scrollMargin = shallowRef(0);
const expandedSources = shallowReactive(new Set());
const focusedKey = shallowRef(null);

const layout = computed(() => {
  const blocks = [];
  const sourcePositions = new Map();
  for (const base of bases.value) {
    sourcePositions.set(base.source, blocks.length);
    const blockCount = Math.max(1, Math.ceil(base.data.length / RECORDS_PER_BLOCK));
    for (let index = 0; index < blockCount; index++) {
      const start = index * RECORDS_PER_BLOCK;
      const end = Math.min(start + RECORDS_PER_BLOCK, base.data.length);
      blocks.push({ key: `${base.source}:${start}`, base, start, end });
    }
  }
  return { blocks, sourcePositions };
});

function estimateBlockSize({ base, start, end }) {
  let height = start === 0 ? (base.info || base.count || base.trust ? 150 : 100) : 0;
  for (let index = start; index < end; index++) height += 82 + base.data[index].length * 42;
  return height;
}

const virtualizer = useVirtualizer(computed(() => {
  const { blocks } = layout.value;
  const focusedIndex = focusedKey.value === null ? -1 : blocks.findIndex(block => block.key === focusedKey.value);
  return {
    count: blocks.length,
    getScrollElement: () => props.viewport ?? null,
    getItemKey: index => blocks[index].key,
    estimateSize: index => estimateBlockSize(blocks[index]),
    scrollMargin: scrollMargin.value,
    scrollPaddingStart: 16,
    overscan: 2,
    // A streamed chunk can insert blocks above the current source.
    anchorTo: 'end',
    rangeExtractor(range) {
      const indexes = defaultRangeExtractor(range);
      // Keep keyboard focus even when scrolling the focused control out of view.
      if (focusedIndex >= 0 && !indexes.includes(focusedIndex)) {
        indexes.push(focusedIndex);
        indexes.sort((a, b) => a - b);
      }
      return indexes;
    },
  };
}));
const visibleBlocks = computed(() => virtualizer.value.getVirtualItems().flatMap(item => {
  const block = layout.value.blocks[item.index];
  return block ? [{ item, block }] : [];
}));

watch([() => props.viewport, () => props.scrollLead, intro, list], ([viewport, lead, header, element], _, cleanup) => {
  if (!viewport || !element) return;
  const updateMargin = () => {
    scrollMargin.value = element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
      - viewport.clientTop + viewport.scrollTop;
  };
  updateMargin();
  const observer = new ResizeObserver(updateMargin);
  for (const target of [viewport, lead, header]) if (target) observer.observe(target);
  cleanup(() => observer.disconnect());
}, { flush: 'post' });

watch(results, () => {
  expandedSources.clear();
  focusedKey.value = null;
  virtualizer.value.measure();
});

function setDetailsExpanded(source, expanded) {
  if (expanded) expandedSources.add(source);
  else expandedSources.delete(source);
}

function measureBlock(element) {
  virtualizer.value.measureElement(element);
}

function scrollToSource(source) {
  const index = layout.value.sourcePositions.get(source);
  if (index !== undefined) virtualizer.value.scrollToIndex(index, { align: 'start' });
}

defineExpose({ scrollToSource });
</script>

<template>
  <div class="mx-page search-results-page space-y-5">
    <div ref="intro" class="space-y-5">
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
      <button v-if="reportState?.expanded === false" type="button"
        class="mx-button report-show-action" @click="searchUI.expandReport(tabId)">
        {{ reportState.report ? 'Показать собранный отчёт' : 'Показать сведения об отчёте' }}
      </button>
      <ReportPanel v-else-if="reportState" :state="reportState"
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
    </div>
    <div v-if="bases.length" ref="list" class="search-result-list relative"
      :style="{ height: `${virtualizer.getTotalSize()}px` }">
      <div v-for="{ item, block } in visibleBlocks" :key="item.key" :ref="measureBlock"
        :data-index="item.index" class="absolute inset-x-0 top-0"
        :class="{ 'pt-5': block.start === 0 && item.index > 0 }"
        :style="{ transform: `translateY(${item.start - scrollMargin}px)` }"
        @focusin="focusedKey = block.key"
        @focusout="!$event.currentTarget.contains($event.relatedTarget) && (focusedKey = null)">
        <SearchSourceCard :base="block.base" :start="block.start" :end="block.end"
          :active="activeBase === block.base.source" :saved="savedSources.has(block.base.source)"
          :saving="savingSources.has(block.base.source)" :expanded="expandedSources.has(block.base.source)"
          :copied="copied" :field-label="fieldLabel"
          @save="saveNote" @copy="copyValue" @toggle-details="setDetailsExpanded(block.base.source, $event)" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-results-page { max-width: 1100px; margin: 0 auto; }
.search-result-list { overflow-anchor: none; }
.search-results-empty { background: rgb(var(--mx-panel-rgb) / 0.38); }
.search-empty-icon {
  background: rgb(var(--mx-accent-rgb) / 0.08);
  border: 1px solid rgb(var(--mx-accent-rgb) / 0.08);
}
</style>
