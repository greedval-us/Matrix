<script setup>
import { Plus, ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { ref, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useTabStore } from '../stores/tabStore';
import { useSearchUIStore } from '../stores/uistore/serchStoreUI';
import TabHeader from '../components/panel/TabHeaderPanel.vue';
import SearchTabPanel from '../components/panel/SearchTabPanel.vue';

const tabStore = useTabStore();
const searchUI = useSearchUIStore();
const route = useRoute();
const tabsContainer = ref(null);
if (!tabStore.state.tabs.length) tabStore.addTab();

function scrollTabs(offset) {
  tabsContainer.value?.scrollBy({ left: offset, behavior: 'smooth' });
}
async function addTab() {
  tabStore.addTab();
  await nextTick();
  tabsContainer.value?.scrollTo({ left: tabsContainer.value.scrollWidth, behavior: 'smooth' });
}
watch(
  () => [route.query.key, route.query.value],
  ([key, value]) => {
    if (
      typeof key === 'string' &&
      typeof value === 'string' &&
      searchUI.icons.some((item) => item.type === key)
    ) {
      const id = tabStore.addTab();
      searchUI.quickSearch(id, { [key]: { key, value } });
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-col">
    <div class="search-tabs-toolbar flex shrink-0 items-center gap-2 border-b border-matrix-border px-3 py-3 md:px-6">
      <button
        class="mx-icon-button !h-7 !w-7"
        aria-label="Прокрутить вкладки влево"
        @click="scrollTabs(-200)"
      >
        <ChevronLeft class="h-4 w-4" />
      </button>
      <nav
        ref="tabsContainer"
        class="search-tabs-list flex min-w-0 flex-1 gap-1.5 overflow-x-auto"
        aria-label="Вкладки поиска"
      >
        <TabHeader v-for="tab in tabStore.state.tabs" :key="tab.id" :tab="tab" />
      </nav>
      <button
        class="mx-icon-button !h-7 !w-7"
        aria-label="Прокрутить вкладки вправо"
        @click="scrollTabs(200)"
      >
        <ChevronRight aria-hidden="true" class="h-4 w-4" />
      </button>
      <button
        class="mx-button search-new-tab shrink-0 !px-3 !py-2 text-xs"
        aria-label="Новый поиск"
        @click="addTab"
      >
        <Plus class="h-4 w-4" /><span class="hidden sm:inline">Новый поиск</span>
      </button>
    </div>
    <SearchTabPanel />
  </div>
</template>

<style scoped>
.search-tabs-toolbar {
  background: rgb(var(--mx-rail-rgb) / 0.62);
  backdrop-filter: blur(20px);
}
.search-tabs-list {
  padding: 6px;
  scrollbar-width: none;
}
.search-tabs-list::-webkit-scrollbar { display: none; }
.search-new-tab { min-height: 36px; }
</style>
