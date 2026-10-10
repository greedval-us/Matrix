<script setup>
import { useId } from 'vue';
import { RefreshCw, Search, X } from 'lucide-vue-next';
import { RECORDS_QUERY_MAX_LENGTH } from '../../../shared/constants/records.js';

defineProps({
  query: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  available: { type: Boolean, default: false },
});
const emit = defineEmits(['query', 'refresh']);
const queryId = useId();
</script>

<template>
  <form class="records-toolbar" role="search" @submit.prevent="emit('refresh')">
    <div class="records-search">
      <label :for="queryId" class="sr-only">Поиск по таблице</label>
      <Search aria-hidden="true" class="records-search-icon" />
      <input
        :id="queryId"
        :value="query"
        :disabled="!available"
        type="search"
        :maxlength="RECORDS_QUERY_MAX_LENGTH"
        autocomplete="off"
        class="mx-input records-search-input"
        placeholder="Поиск по таблице"
        @input="emit('query', $event.target.value)"
      />
      <button
        v-if="query"
        type="button"
        class="mx-icon-button mx-icon-button-compact records-search-clear"
        aria-label="Очистить поиск по таблице"
        :disabled="!available"
        @click="emit('query', '')"
      >
        <X aria-hidden="true" class="h-4 w-4" />
      </button>
    </div>
    <button type="submit" class="mx-button records-refresh" :disabled="loading">
      <RefreshCw aria-hidden="true" class="h-4 w-4" />
      {{ loading ? 'Обновляем…' : 'Обновить' }}
    </button>
  </form>
</template>

<style scoped>
.records-toolbar { display: flex; align-items: center; gap: 12px; min-width: 0; }
.records-search { position: relative; flex: 1; min-width: 0; max-width: 560px; }
.records-search-icon { position: absolute; left: 14px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--mx-muted); pointer-events: none; }
.records-search-input { padding-left: 42px; padding-right: 44px; }
.records-search-input::-webkit-search-cancel-button { display: none; }
.records-search-clear { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); }
.records-search-clear:active:not(:disabled) { transform: translateY(-50%) scale(.94); }
.records-refresh { margin-left: auto; flex-shrink: 0; }
@media (max-width: 560px) {
  .records-toolbar { flex-wrap: wrap; }
  .records-search { flex-basis: 100%; max-width: none; }
}
</style>
