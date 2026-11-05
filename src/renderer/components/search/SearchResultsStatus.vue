<script setup>
import { LoaderCircle, Database, AlertTriangle } from 'lucide-vue-next';
import { formatResultCount } from '../../constants/resultPresentation.js';
defineProps({
  hasSearched: Boolean,
  loading: Boolean,
  meta: { type: Object, default: null },
  error: { type: String, default: '' },
  received: { type: Number, default: 0 },
  recordCount: { type: Number, default: 0 },
});
const emit = defineEmits(['retry']);
</script>

<template>
    <div
      v-if="hasSearched"
      class="search-result-status flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-5 py-4"
      role="status"
    >
      <div class="flex items-center gap-3">
        <LoaderCircle
          aria-hidden="true"
          v-if="loading"
          class="h-4 w-4 animate-spin text-matrix-accent"
        /><Database aria-hidden="true" v-else class="h-4 w-4 text-matrix-accent" />
        <div>
          <span class="text-xl font-semibold tabular-nums text-matrix-strong">{{
            formatResultCount(recordCount)
          }}</span
          ><span class="ml-2 text-sm text-matrix-muted">уникальных записей</span>
        </div>
      </div>
      <span class="text-sm text-matrix-muted">{{
        loading
          ? 'Получение данных…'
          : meta?.cancelled
            ? 'Поиск остановлен'
            : error
              ? 'Запрос не завершён'
              : 'Запрос завершён'
      }}</span>
      <span v-if="received" class="text-sm text-matrix-muted"
        >Получено от сервера: {{ formatResultCount(received) }}</span
      >
      <span v-if="meta?.took_ms != null" class="ml-auto text-sm tabular-nums text-matrix-muted"
        >{{ formatResultCount(meta.took_ms) }} мс</span
      >
    </div>
    <div
      v-if="meta?.partial"
      class="mx-warning flex items-start gap-3 px-4 py-3 text-sm leading-5"
      role="status"
    >
      <AlertTriangle aria-hidden="true" class="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <strong>Частичная выдача</strong>
        <p>
          Сервер ещё обновляет индекс: готово {{ meta.indexed_shards }} из
          {{ meta.total_shards }} частей. Поиск охватывает только готовые данные.
        </p>
      </div>
    </div>
    <div v-if="error" class="mx-alert space-y-3" role="alert">
      <p>{{ error }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          class="mx-button !py-1.5 text-sm"
          :disabled="loading"
          @click="emit('retry')"
        >
          Повторить запрос</button
        ><router-link to="/settings" class="mx-button !py-1.5 text-sm"
          >Настройки сервера</router-link
        >
      </div>
    </div>
</template>

<style scoped>
.search-result-status {
  border: 1px solid rgb(var(--mx-border-rgb) / 0.6);
  background: rgb(var(--mx-panel-rgb) / 0.65);
}
</style>
