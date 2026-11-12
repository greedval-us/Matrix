<script setup>
import { computed, nextTick, shallowRef, useId, watch } from 'vue';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Paperclip, Pencil, Search, Table2, Trash2 } from 'lucide-vue-next';
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
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 25 },
  capabilities: { type: Object, default: () => ({}) },
  pendingRows: { type: Array, default: () => [] },
  pendingFiles: { type: Array, default: () => [] },
});
const emit = defineEmits(['sort', 'upload', 'download', 'remove', 'edit', 'delete']);
const primaryKeys = new Set(['date', 'id', 'source_id', 'number', 'fio']);
const wideDetailKeys = new Set(['note', 'realization', 'intersections']);
const tableId = useId();
const viewport = shallowRef(null);
const viewportWidth = shallowRef(Infinity);
const expandedId = shallowRef(null);
const minimumColumnWidths = { date: 360, id: 615, source_id: 470 };
const primaryColumns = computed(() => {
  const summary = props.columns.filter(({ key }) =>
    primaryKeys.has(key) && viewportWidth.value > (minimumColumnWidths[key] ?? 0));
  return summary.length ? summary : props.columns.slice(0, primaryKeys.size);
});
const pendingRowIds = computed(() => new Set(props.pendingRows));
const hasRows = computed(() => props.rows.length > 0);
const emptyMessage = computed(() => props.query.trim() ? 'Ничего не найдено' : 'В таблице пока нет записей');

watch(viewport, (element, _, onCleanup) => {
  if (!element) return;
  const observer = new ResizeObserver(([entry]) => { viewportWidth.value = entry.contentRect.width; });
  observer.observe(element);
  onCleanup(() => observer.disconnect());
});

watch([() => props.page, () => props.pageSize, () => props.query, () => props.sort], () => {
  expandedId.value = null;
  if (viewport.value) viewport.value.scrollTop = 0;
});

function displayValue(row, key) {
  return formatRecordValue(getRecordValue(row, key));
}

function detailColumns(row) {
  return props.columns.filter(({ key }) => {
    const value = getRecordValue(row, key);
    return value != null && value !== '';
  });
}

async function toggleDetails(rowId, detailId) {
  expandedId.value = expandedId.value === rowId ? null : rowId;
  if (expandedId.value !== rowId) return;
  await nextTick();
  const pane = viewport.value;
  const detail = document.getElementById(detailId);
  if (pane && detail) {
    const hidden = detail.getBoundingClientRect().top - pane.getBoundingClientRect().bottom + 80;
    if (hidden > 0) pane.scrollTop += hidden;
  }
}

function ariaSort(column) {
  if (column.sortable === false || props.sort?.key !== column.key) return undefined;
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
      ref="viewport"
      class="records-table-viewport"
      :aria-busy="loading"
      tabindex="0"
      role="region"
      aria-label="Прокручиваемая таблица записей"
    >
      <table class="records-table">
        <caption class="sr-only">Данные записей и прикреплённые к каждой записи файлы</caption>
        <thead class="records-table-head">
          <tr>
            <th
              v-for="column in primaryColumns"
              :key="`data:${column.key}`"
              scope="col"
              class="records-heading"
              :data-field="column.key"
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
            <th scope="col" class="records-heading records-actions-heading">Действия</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="(row, index) in rows" :key="row.id">
            <tr class="records-row" :class="{ 'records-row-expanded': expandedId === row.id }">
              <td v-for="column in primaryColumns" :key="column.key" class="records-cell" :data-field="column.key">
                <span class="records-value" :title="displayValue(row, column.key)">{{ displayValue(row, column.key) }}</span>
              </td>
              <td class="records-cell records-actions-cell">
                <div class="record-row-actions">
                  <button type="button" class="mx-icon-button mx-icon-button-compact record-details-toggle"
                    :aria-expanded="expandedId === row.id"
                    :aria-controls="expandedId === row.id ? `${tableId}-details-${index}` : undefined"
                    :aria-label="`${expandedId === row.id ? 'Свернуть' : 'Открыть'} запись ${row.id}`"
                    :title="row.files.length ? `Подробности записи · файлов ${row.files.length}` : 'Подробности записи'"
                    @click="toggleDetails(row.id, `${tableId}-details-${index}`)">
                    <template v-if="row.files.length">
                      <Paperclip aria-hidden="true" class="h-3.5 w-3.5" />
                      <span aria-hidden="true">{{ row.files.length }}</span>
                    </template>
                    <ChevronDown v-else aria-hidden="true" class="h-4 w-4" :class="{ 'rotate-180': expandedId === row.id }" />
                  </button>
                  <button type="button" class="mx-icon-button mx-icon-button-compact" :disabled="pendingRowIds.has(row.id) || capabilities.update !== true" :aria-label="`Редактировать запись ${row.id}`" :title="capabilities.update ? 'Редактировать запись' : 'Редактирование недоступно на этом сервере'" @click="emit('edit', row)"><Pencil aria-hidden="true" class="h-4 w-4" /></button>
                  <button type="button" class="mx-icon-button mx-icon-button-compact record-row-delete" :disabled="pendingRowIds.has(row.id) || capabilities.delete !== true" :aria-label="`Удалить запись ${row.id}`" :title="!capabilities.delete ? 'Удаление записей недоступно на этом сервере' : row.files.length ? 'Сначала удалите прикреплённые файлы' : 'Удалить запись'" @click="emit('delete', row)"><Trash2 aria-hidden="true" class="h-4 w-4" /></button>
                </div>
              </td>
            </tr>
            <tr v-if="expandedId === row.id" class="record-details-row">
              <td :colspan="primaryColumns.length + 1">
                <section :id="`${tableId}-details-${index}`" class="record-details" :aria-label="`Подробности записи ${row.id}`">
                  <dl class="record-detail-grid">
                    <div v-for="column in detailColumns(row)" :key="column.key" :class="{ 'record-detail-wide': wideDetailKeys.has(column.key) }">
                      <dt>{{ column.label }}</dt>
                      <dd>{{ displayValue(row, column.key) }}</dd>
                    </div>
                  </dl>
                  <div class="record-detail-files">
                    <h3>Файлы</h3>
                    <RecordAttachments :row="row" :capabilities="capabilities" :pending="pendingRowIds.has(row.id)"
                      :pending-files="pendingFiles" @upload="emit('upload', $event)"
                      @download="emit('download', $event)" @remove="emit('remove', $event)" />
                  </div>
                </section>
              </td>
            </tr>
          </template>
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
.records-table-section { position: relative; display: flex; flex: 1; flex-direction: column; min-height: 0; min-width: 0; }
.records-loading { position: absolute; right: 10px; bottom: 10px; z-index: 3; border: 1px solid var(--mx-border); border-radius: 8px; padding: 7px 10px; background: var(--mx-panel); color: var(--mx-muted); font-size: 12px; pointer-events: none; }
.records-table-viewport { container-type: inline-size; flex: 1; min-height: 0; min-width: 0; overflow: auto; isolation: isolate; }
.records-table-viewport:focus-visible { outline-offset: -2px; }
.records-table { border-collapse: separate; border-spacing: 0; width: 100%; table-layout: fixed; text-align: left; font-size: 13px; }
.records-heading { position: sticky; top: 0; z-index: 2; padding: 8px 10px; border-bottom: 1px solid var(--mx-border); background: var(--mx-raised); color: rgb(var(--mx-secondary-rgb)); font-size: 12px; font-weight: 600; vertical-align: middle; }
.records-heading-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.records-sort-button { display: flex; align-items: center; width: 100%; gap: 5px; padding: 3px 0; border-radius: 4px; text-align: left; }
.records-sort-icon { width: 12px; height: 12px; flex: none; color: var(--mx-muted); }
.records-sort-active { color: var(--mx-accent); }
.records-heading[data-field="date"] { width: 96px; }
.records-heading[data-field="id"] { width: 65px; }
.records-heading[data-field="source_id"] { width: 112px; }
.records-heading[data-field="number"] { width: 124px; }
.records-actions-heading { width: 136px; text-align: right; }
.records-row:hover, .records-row-expanded { background: rgb(var(--mx-raised-rgb) / .56); }
.records-cell { padding: 4px 10px; border-bottom: 1px solid rgb(var(--mx-border-rgb) / .7); vertical-align: middle; }
.records-value { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.45; }
.records-cell[data-field="fio"] { font-weight: 550; }
.records-cell[data-field="date"], .records-cell[data-field="id"], .records-cell[data-field="source_id"],
.records-cell[data-field="number"] { font-variant-numeric: tabular-nums; }
.record-row-actions { display: flex; align-items: center; justify-content: flex-end; gap: 1px; }
.record-details-toggle { width: auto; min-width: 32px; padding-inline: 4px; gap: 2px; color: var(--mx-accent); font-size: 11px; }
.record-details-toggle[aria-expanded="true"] { background: var(--mx-raised); }
.record-row-delete:hover:not(:disabled) { color: rgb(var(--mx-error-rgb)); background: var(--mx-error-surface); }
.record-details { padding: 16px 18px; background: rgb(var(--mx-raised-rgb) / .5); border-bottom: 1px solid var(--mx-border); box-shadow: inset 2px 0 var(--mx-accent); }
.record-detail-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px 20px; }
.record-detail-grid dt { color: var(--mx-muted); font-size: 12px; }
.record-detail-grid dd { margin-top: 3px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere; }
.record-detail-wide { grid-column: 1 / -1; }
.record-detail-files { margin-top: 14px; padding-top: 10px; border-top: 1px solid var(--mx-border); }
.record-detail-files h3 { margin-bottom: 6px; color: rgb(var(--mx-secondary-rgb)); font-size: 12px; font-weight: 600; }
.records-empty { min-height: 144px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; }
.records-table-section > .records-empty { flex: 1; }
.records-empty-icon { width: 28px; height: 28px; margin-bottom: 10px; color: var(--mx-muted); }
.records-empty-title { color: rgb(var(--mx-text-rgb)); font-size: 15px; font-weight: 550; }
@container (max-width: 615px) {
  .record-detail-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@container (max-width: 470px) {
  .records-heading, .records-cell { padding-inline: 6px; }
}
@container (max-width: 360px) {
  .record-detail-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
