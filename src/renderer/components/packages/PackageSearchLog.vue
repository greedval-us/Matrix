<script setup>
import { ListChecks } from 'lucide-vue-next';
defineProps({ logs: { type: Array, required: true }, isRunning: { type: Boolean, default: false } });
</script>

<template>
  <section class="mx-panel min-w-0 p-5">
    <div class="mb-4 flex items-center gap-2">
      <ListChecks aria-hidden="true" class="h-4 w-4 text-matrix-accent" />
      <h2 class="text-sm font-semibold">Ход выполнения</h2>
      <span
        v-if="isRunning"
        class="ml-auto h-2 w-2 animate-pulse rounded-full bg-matrix-accent"
      ></span>
    </div>
    <div v-if="!logs.length" class="mx-empty">
      Здесь появятся этапы поиска<br />и результаты сохранения файлов.
    </div>
    <ol v-else class="max-h-[600px] space-y-3 overflow-y-auto" aria-live="polite">
      <li
        v-for="(log, index) in logs"
        :key="index"
        class="flex gap-3 border-b border-matrix-border pb-3 text-sm leading-5"
      >
        <span class="mt-0.5 shrink-0 text-sm tabular-nums text-matrix-muted">{{
          String(index + 1).padStart(2, '0')
        }}</span
        ><span class="min-w-0 break-words text-matrix-muted">{{ log }}</span>
      </li>
    </ol>
  </section>
</template>
