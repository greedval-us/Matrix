<script setup>
import { useTabStore } from '../../stores/tabStore';
import SearchTabContent from '../search/SearchTabContent.vue';
const tabStore = useTabStore();
</script>

<template>
  <div class="min-h-0 min-w-0 flex-1">
    <SearchTabContent
      v-if="tabStore.state.activeTabId"
      :key="tabStore.state.activeTabId"
      :tab-id="tabStore.state.activeTabId"
    />
  </div>
</template>
