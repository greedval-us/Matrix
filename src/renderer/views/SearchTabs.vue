<script setup>
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { ref, nextTick, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTabStore } from '../stores/tabStore'
import TabHeader from '../components/panel/TabHeaderPanel.vue'
import SearchTabPanel from '../components/panel/SearchTabPanel.vue'
import { useSearchUIStore } from '../stores/uistore/serchStoreUI'

const tabStore = useTabStore()
const searchUI = useSearchUIStore()
const route = useRoute()
const tabsContainer = ref(null)

function scrollTabs(offset) {
  if (tabsContainer.value) {
    tabsContainer.value.scrollBy({
      left: offset,
      behavior: 'smooth'
    })
  }
}

function scrollToEnd() {
  if (tabsContainer.value) {
    tabsContainer.value.scrollTo({
      left: tabsContainer.value.scrollWidth,
      behavior: 'smooth'
    })
  }
}

function addTabAndScroll() {
  tabStore.addTab()
  nextTick(() => {
    scrollToEnd()
  })
}

onMounted(async () => {
  tabStore.resetTabs()
  await nextTick()

  if (!tabStore.state.activeTabId) {
    tabStore.addTab()
    await nextTick()
    scrollToEnd()
  }

  const { key, value } = route.query
  if (key && value) {
    const activeTabId = tabStore.state.activeTabId
    searchUI.quickSearch(activeTabId, { [0]: route.query })
  }
})
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex items-center bg-neutral-900/90 backdrop-blur-md rounded-t-xl px-2 py-1 border-b border-neutral-700 gap-1">

      <button 
        @click="scrollTabs(-100)"
        class="flex items-center justify-center w-8 h-8 text-gray-400 bg-neutral-800 rounded-full shadow-sm hover:bg-neutral-700 hover:text-white transition"
        title="Прокрутить влево"
      >
        <ChevronLeft class="w-5 h-5"/>
      </button>

      <div ref="tabsContainer" class="flex-1 flex gap-1 overflow-x-auto scrollbar-none">
        <transition-group name="tab-fade" tag="div" class="flex gap-1">
          <TabHeader
            v-for="tab in tabStore.state.tabs"
            :key="tab.id"
            :tab="tab"
          />
        </transition-group>
      </div>

      <button 
        @click="scrollTabs(100)"
        class="flex items-center justify-center w-8 h-8 text-gray-400 bg-neutral-800 rounded-full shadow-sm hover:bg-neutral-700 hover:text-white transition"
        title="Прокрутить вправо"
      >
        <ChevronRight class="w-5 h-5"/>
      </button>

      <button
        @click="addTabAndScroll"
        class="flex items-center justify-center w-8 h-8 rounded-full 
               bg-neutral-700 text-green-400 text-lg font-bold 
               hover:bg-neutral-600 hover:text-green-300 transition"
        title="Новая вкладка"
      >
        <span class="leading-none">+</span>
      </button>
    </div>

    <SearchTabPanel />
  </div>
</template>

<style>
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: all 0.25s ease;
}
.tab-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.tab-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* Скрыть скроллбар */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
