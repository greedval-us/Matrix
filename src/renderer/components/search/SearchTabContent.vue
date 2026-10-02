<script setup>
import { computed, ref, watch, nextTick } from 'vue';
import { ChevronDown, SlidersHorizontal, Database } from 'lucide-vue-next';
import SearchIcons from './SearchIcons.vue';
import SearchInputs from './SearchInputs.vue';
import SearchButton from './SearchButton.vue';
import SearchResults from './SearchResults.vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
import { groupSearchResults } from '../../utils/searchResults';

const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const resultsPane = ref(null);
const baseGroups = computed(() => groupSearchResults(searchUI.getResults(props.tabId)));
const activeBase = computed(() => searchUI.getActiveBase(props.tabId));

function submitSearch(event) {
  if (event.submitter || searchUI.getLoading(props.tabId)) return;
  const fields = searchUI.getSelectedFields(props.tabId);
  if (Object.values(fields).some((field) => String(field.value).trim()))
    searchUI.search(props.tabId);
}
watch(activeBase, async (name) => {
  await nextTick();
  const target = [...(resultsPane.value?.querySelectorAll('[data-base-name]') || [])].find(
    (element) => element.dataset.baseName === name,
  );
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
</script>

<template>
  <div
    class="h-full min-h-0 min-w-0 overflow-auto lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:overflow-hidden xl:grid-cols-[340px_minmax(0,1fr)]"
  >
    <aside
      class="space-y-6 border-b border-[#293443] bg-[#101720]/50 p-5 lg:overflow-y-auto lg:border-b-0 lg:border-r xl:p-6"
    >
      <div>
        <div class="flex items-center gap-2">
          <SlidersHorizontal class="h-4 w-4 text-emerald-300" />
          <h1 class="text-lg font-semibold tracking-tight">Параметры поиска</h1>
        </div>
        <p class="mt-2 text-xs leading-5 text-slate-500">
          Выберите поля и введите данные. Несколько полей уточняют запрос.
        </p>
      </div>
      <div>
        <p class="mx-eyebrow mb-3">Тип данных</p>
        <SearchIcons :tab-id="tabId" />
      </div>
      <form class="space-y-5" @submit.prevent="submitSearch">
        <SearchInputs :tab-id="tabId" />
        <SearchButton :tab-id="tabId" />
      </form>
      <div
        class="rounded-lg border border-[#293443] px-3 py-2.5 text-[11px] leading-5 text-slate-500"
      >
        Для поиска по части значения используйте маски <span class="text-slate-300">%</span> и
        <span class="text-slate-300">?</span>. Данные передаются серверу как введены.
      </div>
      <details v-if="baseGroups.length" open class="border-t border-[#293443] pt-5">
        <summary class="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-300">
          <Database class="h-3.5 w-3.5" />Источники
          <span class="mx-badge ml-auto">{{ baseGroups.length }}</span
          ><ChevronDown class="h-3 w-3" />
        </summary>
        <div class="mt-3 space-y-1">
          <button
            v-for="base in baseGroups"
            :key="base.source"
            type="button"
            :class="[
              'flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs',
              activeBase === base.name
                ? 'bg-emerald-300/10 text-emerald-200'
                : 'text-slate-400 hover:bg-[#1b2531]',
            ]"
            @click="searchUI.setActiveBase(base.name, tabId)"
          >
            <span class="min-w-0 break-words">{{ base.name }}</span
            ><span class="shrink-0 text-slate-500">{{ base.data.length }}</span>
          </button>
        </div>
      </details>
    </aside>
    <section
      ref="resultsPane"
      class="min-h-0 min-w-0 lg:overflow-y-auto"
      aria-label="Результаты поиска"
    >
      <SearchResults :tab-id="tabId" />
    </section>
  </div>
</template>
