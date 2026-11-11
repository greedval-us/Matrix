<script setup>
import { computed, onMounted, onUnmounted, shallowRef, useTemplateRef } from 'vue';
import { ChevronDown, Search, Database, Info } from 'lucide-vue-next';
import SearchIcons from './SearchIcons.vue';
import SearchInputs from './SearchInputs.vue';
import SearchButton from './SearchButton.vue';
import SearchResults from './SearchResults.vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
import { useSearchResults } from '../../composables/useSearchResults.js';

const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const tabContent = useTemplateRef('tabContent');
const inspector = useTemplateRef('inspector');
const resultsPane = useTemplateRef('resultsPane');
const results = useTemplateRef('results');
const wideLayout = shallowRef(false);
const viewport = computed(() => wideLayout.value ? resultsPane.value : tabContent.value);
const scrollLead = computed(() => wideLayout.value ? null : inspector.value);
const searchResults = useSearchResults({ tabId: () => props.tabId, searchUI });
const { bases: baseGroups, activeBase } = searchResults;
let layoutMedia;

function updateLayout() {
  wideLayout.value = layoutMedia.matches;
}

onMounted(() => {
  layoutMedia = window.matchMedia('(min-width: 1024px)');
  updateLayout();
  layoutMedia.addEventListener('change', updateLayout);
});
onUnmounted(() => layoutMedia?.removeEventListener('change', updateLayout));

function submitSearch(event) {
  if (event.submitter || searchUI.getLoading(props.tabId)) return;
  const fields = searchUI.getSelectedFields(props.tabId);
  if (Object.values(fields).some((field) => String(field.value).trim()))
    searchUI.search(props.tabId);
}
function showSource(source) {
  searchUI.setActiveBase(source, props.tabId);
  results.value?.scrollToSource(source);
}
</script>

<template>
  <div
    ref="tabContent"
    class="h-full min-h-0 min-w-0 overflow-auto lg:grid lg:grid-cols-[328px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[352px_minmax(0,1fr)]"
  >
    <aside
      ref="inspector"
      class="search-inspector space-y-6 border-b border-matrix-border p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r xl:p-6"
    >
      <div>
        <div class="flex items-center gap-3">
          <span class="search-heading-icon flex h-9 w-9 items-center justify-center rounded-xl">
            <Search aria-hidden="true" class="h-[18px] w-[18px] text-matrix-accent" />
          </span>
          <h1 class="text-xl font-semibold tracking-tight">Новый запрос</h1>
        </div>
        <p class="mt-2 text-sm leading-6 text-matrix-muted">
          Выберите данные для поиска. Добавьте несколько полей, чтобы уточнить запрос.
        </p>
      </div>
      <div>
        <p class="mb-3 text-xs font-medium text-matrix-muted">Искать по</p>
        <SearchIcons :tab-id="tabId" />
      </div>
      <form class="space-y-5" @submit.prevent="submitSearch">
        <SearchInputs :tab-id="tabId" />
        <SearchButton :tab-id="tabId" />
      </form>
      <div
        class="search-query-hint flex items-start gap-2.5 rounded-xl px-3 py-3 text-xs leading-5 text-matrix-muted"
      >
        <Info aria-hidden="true" class="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>Для поиска по части значения используйте
          <span class="font-medium text-matrix-secondary">%</span> и
          <span class="font-medium text-matrix-secondary">?</span>.
        </p>
      </div>
      <details v-if="baseGroups.length" open class="border-t border-matrix-border pt-5">
        <summary
          class="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-matrix-secondary"
        >
          <Database aria-hidden="true" class="h-3.5 w-3.5" />Источники
          <span class="mx-badge ml-auto">{{ baseGroups.length }}</span
          ><ChevronDown aria-hidden="true" class="h-3 w-3" />
        </summary>
        <div class="mt-3 space-y-1">
          <button
            v-for="base in baseGroups"
            :key="base.source"
            type="button"
            :class="[
              'search-source-link flex w-full items-start justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13px]',
              activeBase === base.source
                ? 'bg-matrix-accent/10 text-matrix-accent'
                : 'text-matrix-muted hover:bg-matrix-raised',
            ]"
            @click="showSource(base.source)"
          >
            <span class="min-w-0 break-words">{{ base.name }}</span
            ><span class="shrink-0 text-matrix-muted">{{ base.data.length }}</span>
          </button>
        </div>
      </details>
    </aside>
    <section
      ref="resultsPane"
      class="min-h-0 min-w-0 lg:overflow-y-auto"
      aria-label="Результаты поиска"
    >
      <SearchResults ref="results" :tab-id="tabId" :state="searchResults"
        :viewport="viewport" :scroll-lead="scrollLead" />
    </section>
  </div>
</template>

<style scoped>
.search-inspector { background: rgb(var(--mx-rail-rgb) / 0.46); }
.search-heading-icon { background: rgb(var(--mx-accent-rgb) / 0.09); }
.search-query-hint { background: rgb(var(--mx-raised-rgb) / 0.6); }
.search-source-link { transition: background var(--mx-motion-fast), color var(--mx-motion-fast); }
</style>
