<script setup>
import { useTabStore } from '../../stores/tabStore'
import SearchTabContent from '../search/SearchTabContent.vue'

const tabStore = useTabStore()
</script>

<template>
  <div class="h-full flex-grow overflow-hidden rounded-b-md bg-neutral-900">
    <div
      v-for="tab in tabStore.state.tabs"
      :key="tab.id"
      v-show="tab.id === tabStore.state.activeTabId"
      class="w-full h-full"
    >
      <SearchTabContent />
    </div>
  </div>
</template>