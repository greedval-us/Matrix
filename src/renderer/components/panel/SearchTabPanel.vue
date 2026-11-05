<script setup>
import { useTabStore } from '../../stores/tabStore';
import SearchTabContent from '../search/SearchTabContent.vue';
const tabStore = useTabStore();
</script>

<template>
  <div class="min-h-0 min-w-0 flex-1">
    <Transition name="search-tab-content" mode="out-in">
      <SearchTabContent
        v-if="tabStore.state.activeTabId"
        :key="tabStore.state.activeTabId"
        :tab-id="tabStore.state.activeTabId"
      />
    </Transition>
  </div>
</template>

<style scoped>
.search-tab-content-enter-active { transition: opacity 180ms ease, transform 180ms ease; }
.search-tab-content-leave-active { transition: opacity 100ms ease; }
.search-tab-content-enter-from { opacity: 0; transform: translateY(3px); }
.search-tab-content-leave-to { opacity: 0; }
</style>
