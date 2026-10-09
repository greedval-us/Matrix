<script setup>
import { ArrowUpRight } from 'lucide-vue-next';
defineProps({
  suggestions: { type: Array, required: true },
  fieldLabel: { type: Function, required: true },
});
const emit = defineEmits(['search']);
</script>

<template>
    <div class="search-suggestions rounded-2xl p-4">
      <details>
        <summary class="cursor-pointer text-sm font-medium text-matrix-secondary">
          Связанные данные
          <span class="ml-1 text-matrix-muted">· {{ suggestions.length }}</span>
        </summary>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="item in suggestions"
            :key="item.fieldKey + ':' + item.fieldValue"
            class="mx-button search-suggestion max-w-full !px-3 !py-2 text-left !text-sm"
            title="Поиск в новой вкладке"
            @click="emit('search', item.preload)"
          >
            <span class="text-matrix-muted">{{ fieldLabel(item.fieldKey) }}</span
            ><span class="min-w-0 [overflow-wrap:anywhere]">{{ item.fieldValue }}</span
            ><ArrowUpRight aria-hidden="true" class="h-3.5 w-3.5 shrink-0 text-matrix-accent" />
          </button>
        </div>
      </details>
    </div>
</template>

<style scoped>
.search-suggestions { border: 1px solid rgb(var(--mx-border-rgb) / 0.65); background: rgb(var(--mx-panel-rgb) / 0.5); }
.search-suggestion { min-height: 38px; border-radius: 10px; }
</style>
