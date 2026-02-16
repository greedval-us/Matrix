<script setup>
import { ListTodo, StickyNote } from 'lucide-vue-next'
import { useModalsStore } from '../../stores/modals'

const collapsed = defineModel()
const modalsStore = useModalsStore()
</script>

<template>
  <div class="px-3 py-2 border-t border-neutral-800 text-white">
    <div v-show="!collapsed" class="mb-2 text-xs text-neutral-400 uppercase tracking-wide">Действия</div>
    <div class="flex flex-col gap-2">
      <button
        @click="modalsStore.openNoteModal()"
        class="flex items-center gap-2 text-sm px-2 py-1 hover:bg-neutral-800 rounded-lg transition"
      >
        <StickyNote class="w-4 h-4" />
        <span v-show="!collapsed">Добавить заметку</span>
      </button>

      <button
        @click="modalsStore.openTaskModal()"
        class="flex items-center gap-2 text-sm px-2 py-1 hover:bg-neutral-800 rounded-lg transition"
      >
        <ListTodo class="w-4 h-4" />
        <span v-show="!collapsed">Добавить задачу</span>
      </button>
    </div>
  </div>
</template>
