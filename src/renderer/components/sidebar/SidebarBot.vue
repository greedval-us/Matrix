<script setup>
import { Plus, StickyNote, ListTodo } from 'lucide-vue-next';
import { useModalsStore } from '../../stores/modals';
const collapsed = defineModel({ type: Boolean, default: false });
const modalsStore = useModalsStore();
</script>

<template>
  <div class="quick-actions space-y-1 px-2 py-3">
    <button
      class="quick-action"
      :class="{ 'is-collapsed': collapsed }"
      aria-label="Добавить заметку"
      title="Добавить заметку"
      @click="modalsStore.openNoteModal()"
    >
      <StickyNote aria-hidden="true" class="h-[18px] w-[18px] shrink-0" /><span
        class="action-label"
        >Добавить заметку</span
      ><Plus aria-hidden="true" class="action-plus h-3 w-3" />
    </button>
    <button
      class="quick-action"
      :class="{ 'is-collapsed': collapsed }"
      aria-label="Добавить задачу"
      title="Добавить задачу"
      @click="modalsStore.openTaskModal()"
    >
      <ListTodo aria-hidden="true" class="h-[18px] w-[18px] shrink-0" /><span
        class="action-label"
        >Добавить задачу</span
      ><Plus aria-hidden="true" class="action-plus h-3 w-3" />
    </button>
  </div>
</template>

<style scoped>
.quick-actions {
  border-top: 1px solid rgb(var(--mx-border-rgb) / 0.7);
}
.quick-action {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  gap: 11px;
  padding: 9px 15px;
  border-radius: 10px;
  color: rgb(var(--mx-muted-rgb));
  font-size: 12px;
  white-space: nowrap;
  text-align: left;
  overflow: hidden;
  transition:
    background var(--mx-motion-fast),
    color var(--mx-motion-fast);
}
.quick-action:hover {
  background: rgb(var(--mx-raised-rgb) / 0.8);
  color: rgb(var(--mx-strong-rgb));
}
.action-label,
.action-plus {
  display: none;
}
@media (min-width: 768px) {
  .action-label {
    display: block;
    flex: 1;
    min-width: 0;
    max-width: 145px;
    overflow: hidden;
    opacity: 1;
    transition:
      opacity var(--mx-motion-fast),
      max-width var(--mx-motion-standard);
  }
  .action-plus {
    display: block;
    flex-shrink: 0;
    opacity: 1;
    transition: opacity var(--mx-motion-fast);
  }
  .is-collapsed .action-label {
    max-width: 0;
    opacity: 0;
  }
  .is-collapsed .action-plus {
    opacity: 0;
  }
}
</style>
