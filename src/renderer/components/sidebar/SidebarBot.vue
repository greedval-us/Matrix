<script setup>
import { Plus, StickyNote, ListTodo } from 'lucide-vue-next';
import { useModalsStore } from '../../stores/modals';
const collapsed = defineModel();
const modalsStore = useModalsStore();
</script>

<template>
  <div class="border-t border-[#293443] px-2 py-4">
    <p v-if="!collapsed" class="mx-eyebrow mb-2 hidden px-4 md:block">Быстрые действия</p>
    <button
      class="flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 text-xs text-slate-400 hover:bg-[#1b2531] hover:text-slate-100"
      aria-label="Добавить заметку"
      title="Добавить заметку"
      @click="modalsStore.openNoteModal()"
    >
      <StickyNote class="h-[18px] w-[18px] shrink-0" /><span
        v-if="!collapsed"
        class="hidden flex-1 text-left md:block"
        >Заметка</span
      ><Plus v-if="!collapsed" class="hidden h-3 w-3 md:block" />
    </button>
    <button
      class="flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 text-xs text-slate-400 hover:bg-[#1b2531] hover:text-slate-100"
      aria-label="Добавить задачу"
      title="Добавить задачу"
      @click="modalsStore.openTaskModal()"
    >
      <ListTodo class="h-[18px] w-[18px] shrink-0" /><span
        v-if="!collapsed"
        class="hidden flex-1 text-left md:block"
        >Задача</span
      ><Plus v-if="!collapsed" class="hidden h-3 w-3 md:block" />
    </button>
  </div>
</template>
