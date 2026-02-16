<script setup>
import { computed } from 'vue'
import { useTabStore } from '../../stores/tabStore'
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI'

const tabStore = useTabStore()
const searchUI = useSearchUIStore()

const activeTabId = computed(() => tabStore.state.activeTabId)
const selectedFields = computed(() => searchUI.getSelectedFields(activeTabId.value))
const selectedKeys = computed(() => Object.keys(selectedFields.value))

function toggleInput(option) {
  searchUI.toggleField(activeTabId.value, option.type)
}
</script>

<template>
<div class="flex flex-wrap justify-center gap-3">
  <button
    v-for="option in searchUI.icons"
    :key="option.type"
    @click="toggleInput(option)"
    :class="[
      'w-8 h-8 flex items-center justify-center rounded-xl shadow-md transition-all duration-200 transform',
      selectedKeys.includes(option.type)
        ? 'bg-gradient-to-br from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 shadow-lg scale-105'
        : 'bg-neutral-800 hover:bg-neutral-700'
    ]"
    :title="option.label"
  >
    <component :is="option.icon" class="w-5 h-5 text-white"/>
  </button>
</div>
</template>
