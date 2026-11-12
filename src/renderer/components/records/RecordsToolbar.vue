<script setup>
import { computed, useId } from 'vue';
import { ArrowDown, ArrowUp, Plus, RefreshCw, Search, X } from 'lucide-vue-next';
import { RECORDS_QUERY_MAX_LENGTH } from '../../../shared/constants/records.js';

const props = defineProps({
  query: { type: String, default: '' },
  loading: { type: Boolean, default: false },
  available: { type: Boolean, default: false },
  canCreate: { type: Boolean, default: false },
  columns: { type: Array, default: () => [] },
  sort: { type: Object, default: null },
});
const emit = defineEmits(['query', 'sort', 'refresh', 'create']);
const queryId = useId();
const sortableColumns = computed(() => props.columns.filter(column => column.sortable !== false));
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
    <div v-if="sortableColumns.length" class="records-sort-control">
      <select class="mx-input records-sort-select" aria-label="Поле сортировки" :value="sort?.key ?? ''"
        :disabled="loading" @change="emit('sort', $event.target.value)">
        <option value="" disabled>Сортировка</option>
        <option v-for="column in sortableColumns" :key="column.key" :value="column.key">{{ column.label }}</option>
      </select>
      <button type="button" class="mx-icon-button mx-icon-button-compact" :disabled="loading || !sort"
        aria-label="Изменить направление сортировки" :title="sort?.direction === 'desc' ? 'По убыванию' : 'По возрастанию'"
        @click="emit('sort', sort.key)">
        <component :is="sort?.direction === 'desc' ? ArrowDown : ArrowUp" aria-hidden="true" class="h-4 w-4" />
      </button>
    </div>
    <button type="submit" class="mx-button records-refresh" aria-label="Обновить" title="Обновить" :disabled="loading">
      <RefreshCw aria-hidden="true" class="h-4 w-4" />
      <span>{{ loading ? 'Обновляем…' : 'Обновить' }}</span>
    </button>
    <button type="button" class="mx-button mx-button-primary" :disabled="!available || !canCreate" :title="canCreate ? 'Создать запись' : 'Создание записей недоступно на этом сервере'" @click="emit('create')">
      <Plus aria-hidden="true" class="h-4 w-4" />Новая запись
    </button>
  </form>
</template>

<style scoped>
.records-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; min-width: 0; }
.records-search { position: relative; flex: 1; min-width: 0; max-width: 560px; }
.records-sort-control { display: flex; align-items: center; min-width: 0; gap: 2px; }
.records-sort-select { width: clamp(112px, 17vw, 154px); padding: 7px; font-size: 12px; }
.records-search-icon { position: absolute; left: 14px; top: 50%; width: 18px; height: 18px; transform: translateY(-50%); color: var(--mx-muted); pointer-events: none; }
.records-search-input { padding-left: 42px; padding-right: 44px; }
.records-search-input::-webkit-search-cancel-button { display: none; }
.records-search-clear { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); }
.records-search-clear:active:not(:disabled) { transform: translateY(-50%) scale(.94); }
.records-refresh { flex-shrink: 0; }
@media (max-width: 1030px) {
  .records-refresh span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .records-refresh { padding-inline: 12px; }
}
@media (max-width: 560px) {
  .records-search { flex-basis: 100%; max-width: none; }
}
</style>
