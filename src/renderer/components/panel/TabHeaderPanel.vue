<script setup>
import { X } from 'lucide-vue-next'
import { useTabStore } from '../../stores/tabStore'

const props = defineProps(['tab'])
const tabStore = useTabStore()
</script>

<template>
  <div
    :class="[
      'group relative flex items-center rounded-t-md cursor-pointer transition-all duration-200 flex-shrink-0',
      'min-w-[120px] max-w-[180px] px-3 py-1 text-sm',
      props.tab.id === tabStore.state.activeTabId
        ? 'bg-neutral-700 text-white shadow-inner'
        : 'bg-neutral-800/70 text-gray-400 hover:bg-neutral-700 hover:text-gray-200'
    ]"
    @click="tabStore.setActive(props.tab.id)"
    @dblclick.stop="tabStore.startEdit(props.tab)"
  >
    <template v-if="tabStore.state.editingTabId === props.tab.id">
      <input
        :value="tabStore.state.editTitle"
        @input="e => tabStore.updateEditTitle(e.target.value)"
        @keyup.enter="tabStore.finishEdit(props.tab)"
        @blur="tabStore.finishEdit(props.tab)"
        class="bg-neutral-700 border border-neutral-500 rounded text-white text-sm w-[100px] outline-none px-1"
        autofocus
      />
    </template>

    <template v-else>
      <span class="truncate pr-5">{{ tab.title }}</span>
    </template>

    <button
      v-if="tabStore.state.tabs.length > 1"
      class="absolute right-1 flex items-center justify-center w-4 h-4 
             opacity-0 group-hover:opacity-100 transition 
             text-gray-500 hover:bg-red-500 hover:text-white rounded-full"
      @click.stop="tabStore.closeTab(props.tab.id)"
      title="Закрыть вкладку"
    >
      <X class="w-3 h-3" />
    </button>
  </div>
</template>
