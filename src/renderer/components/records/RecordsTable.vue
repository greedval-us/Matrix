<script setup>
import { computed } from 'vue';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Table2 } from 'lucide-vue-next';
import { formatRecordValue, getRecordValue } from '../../utils/records.js';
import { RECORDS_UNAVAILABLE_MESSAGE } from '../../../shared/constants/records.js';
import RecordAttachments from './RecordAttachments.vue';

const props = defineProps({
  columns: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  available: { type: Boolean, default: false },
  error: { type: String, default: '' },
  query: { type: String, default: '' },
  sort: { type: Object, default: null },
  capabilities: { type: Object, default: () => ({}) },
  pendingRows: { type: Array, default: () => [] },
  pendingFiles: { type: Array, default: () => [] },
});
const emit = defineEmits(['sort', 'upload', 'download', 'remove']);
const pendingRowIds = computed(() => new Set(props.pendingRows));
const hasRows = computed(() => props.rows.length > 0);
const emptyMessage = computed(() => props.query.trim() ? 'Ничего не найдено' : 'В таблице пока нет записей');

function ariaSort(column) {
  if (column.sortable === false) return undefined;
  if (props.sort?.key !== column.key) return 'none';
  return props.sort.direction === 'asc' ? 'ascending' : 'descending';
}

function sortIcon(column) {
  if (props.sort?.key !== column.key) return ArrowUpDown;
  return props.sort.direction === 'asc' ? ArrowUp : ArrowDown;
}

function sortLabel(column) {
  const nextDirection = props.sort?.key === column.key && props.sort.direction === 'asc'
    ? 'по убыванию'
    : 'по возрастанию';
  return `Сортировать «${column.label}» ${nextDirection}`;
}
</script>

<template>
  <section class="records-table-section" aria-label="Записи и файлы">
    <div v-if="loading" class="records-loading" role="status">Загружаем записи…</div>
    <div
      v-if="available && (hasRows || columns.length)"
      class="records-table-viewport"
      :aria-busy="loading"
      tabindex="0"
      role="region"
      aria-label="Таблица записей, доступна горизонтальная прокрутка"
    >
      <table class="records-table">
        <caption class="sr-only">Данные записей и прикреплённые к каждой записи файлы</caption>
        <thead class="records-table-head">
          <tr>
            <th
              v-for="column in columns"
              :key="`data:${column.key}`"
              scope="col"
              class="records-heading"
              :aria-sort="ariaSort(column)"
            >
              <button
                v-if="column.sortable !== false"
                type="button"
                class="records-sort-button"
                :aria-label="sortLabel(column)"
                :disabled="loading"
                @click="emit('sort', column.key)"
              >
                <span class="records-heading-label">{{ column.label }}</span>
                <component
                  :is="sortIcon(column)"
                  aria-hidden="true"
                  class="records-sort-icon"
                  :class="{ 'records-sort-active': sort?.key === column.key }"
                />
              </button>
              <span v-else class="records-heading-label">{{ column.label }}</span>
            </th>
            <th scope="col" class="records-heading records-files-heading">Файлы</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id" class="records-row">
            <td
              v-for="column in columns"
              :key="`value:${column.key}`"
              class="records-cell"
            >
              <span class="records-value">{{ formatRecordValue(getRecordValue(row, column.key)) }}</span>
            </td>
            <td class="records-cell records-files-cell">
              <RecordAttachments
                :row="row"
                :capabilities="capabilities"
                :pending="pendingRowIds.has(row.id)"
                :pending-files="pendingFiles"
                @upload="emit('upload', $event)"
                @download="emit('download', $event)"
                @remove="emit('remove', $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!hasRows && !loading && !error" class="mx-empty records-empty">
        <Search v-if="query.trim()" aria-hidden="true" class="records-empty-icon" />
        <Table2 v-else aria-hidden="true" class="records-empty-icon" />
        <p class="records-empty-title">{{ emptyMessage }}</p>
        <p v-if="query.trim()">Попробуйте другой поисковый запрос.</p>
      </div>
    </div>
    <div v-else-if="!loading && !error" class="mx-empty records-empty" :role="!available ? 'status' : undefined">
      <Table2 aria-hidden="true" class="records-empty-icon" />
      <p class="records-empty-title">{{ available ? emptyMessage : 'Таблица ожидает подключения' }}</p>
      <p>{{ available ? 'Новые данные появятся здесь после загрузки.' : capabilities.message || RECORDS_UNAVAILABLE_MESSAGE }}</p>
    </div>
  </section>
</template>

<style scoped>
.records-table-section { min-width: 0; max-width: 100%; }
.records-loading { padding: 12px 18px; color: var(--mx-muted); font-size: 13px; }
.records-table-viewport { min-width: 0; max-width: 100%; max-height: 65vh; overflow: auto; isolation: isolate; }
.records-table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: max-content; text-align: left; font-size: 14px; }
.records-heading { position: sticky; top: 0; z-index: 2; min-width: 180px; max-width: 360px; padding: 13px 18px; border-bottom: 1px solid var(--mx-border); background: var(--mx-raised); color: rgb(var(--mx-secondary-rgb)); font-size: 12px; font-weight: 600; vertical-align: middle; }
.records-heading-label { display: block; overflow-wrap: anywhere; }
.records-sort-button { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; padding: 4px 0; border-radius: 4px; text-align: left; }
.records-sort-icon { width: 14px; height: 14px; flex-shrink: 0; color: var(--mx-muted); }
.records-sort-active { color: var(--mx-accent); }
.records-files-heading { right: 0; z-index: 3; min-width: 286px; border-left: 1px solid var(--mx-border); }
.records-row { --records-row-background: var(--mx-panel); }
.records-row:hover { --records-row-background: rgb(var(--mx-raised-rgb)); }
.records-cell { padding: 16px 18px; border-bottom: 1px solid rgb(var(--mx-border-rgb) / .75); background: var(--records-row-background); vertical-align: top; transition: background var(--mx-motion-fast); }
.records-row:last-child .records-cell { border-bottom: 0; }
.records-value { display: block; min-width: 144px; max-width: 324px; overflow-wrap: anywhere; white-space: pre-wrap; line-height: 1.6; }
.records-files-cell { position: sticky; right: 0; z-index: 1; border-left: 1px solid var(--mx-border); }
.records-empty { min-height: 240px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.records-empty-icon { width: 28px; height: 28px; margin-bottom: 10px; color: var(--mx-muted); }
.records-empty-title { color: rgb(var(--mx-text-rgb)); font-size: 15px; font-weight: 550; }
</style>
