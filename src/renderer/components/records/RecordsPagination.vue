<script setup>
import { computed, useId } from 'vue';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next';
import { RECORDS_PAGE_SIZES } from '../../../shared/constants/records.js';

const props = defineProps({
  page: { type: Number, required: true },
  pageSize: { type: Number, required: true },
  total: { type: Number, required: true },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['page', 'pageSize']);
const pageSizeId = useId();
const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const firstRecord = computed(() => props.total ? (props.page - 1) * props.pageSize + 1 : 0);
const lastRecord = computed(() => Math.min(props.page * props.pageSize, props.total));
const numberFormat = new Intl.NumberFormat('ru-RU');
</script>

<template>
  <footer class="records-pagination">
    <p class="records-range" role="status">
      {{ total ? `${numberFormat.format(firstRecord)}–${numberFormat.format(lastRecord)} из ${numberFormat.format(total)}` : '0 записей' }}
    </p>
    <div class="records-page-size">
      <label :for="pageSizeId">Строк на странице</label>
      <select
        :id="pageSizeId"
        :value="pageSize"
        :disabled="loading"
        class="mx-input records-page-select"
        @change="emit('pageSize', Number($event.target.value))"
      >
        <option v-for="size in RECORDS_PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
      </select>
    </div>
    <nav class="records-page-navigation" aria-label="Страницы таблицы">
      <button type="button" class="mx-icon-button mx-icon-button-compact"
        aria-label="Первая страница" title="Первая страница" :disabled="loading || page <= 1" @click="emit('page', 1)">
        <ChevronsLeft aria-hidden="true" class="h-4 w-4" />
      </button>
      <button
        type="button"
        class="mx-icon-button mx-icon-button-compact"
        aria-label="Предыдущая страница"
        title="Предыдущая страница"
        :disabled="loading || page <= 1"
        @click="emit('page', page - 1)"
      >
        <ChevronLeft aria-hidden="true" class="h-4 w-4" />
      </button>
      <span class="records-page-count">Страница {{ numberFormat.format(page) }} из {{ numberFormat.format(pageCount) }}</span>
      <button
        type="button"
        class="mx-icon-button mx-icon-button-compact"
        aria-label="Следующая страница"
        title="Следующая страница"
        :disabled="loading || page >= pageCount"
        @click="emit('page', page + 1)"
      >
        <ChevronRight aria-hidden="true" class="h-4 w-4" />
      </button>
      <button type="button" class="mx-icon-button mx-icon-button-compact"
        aria-label="Последняя страница" title="Последняя страница" :disabled="loading || page >= pageCount" @click="emit('page', pageCount)">
        <ChevronsRight aria-hidden="true" class="h-4 w-4" />
      </button>
    </nav>
  </footer>
</template>

<style scoped>
.records-pagination { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; color: var(--mx-muted); font-size: 12px; }
.records-range { margin-right: auto; color: rgb(var(--mx-secondary-rgb)); white-space: nowrap; font-variant-numeric: tabular-nums; }
.records-page-size { display: flex; align-items: center; gap: 6px; }
.records-page-select { width: 60px; min-height: 32px; padding: 4px 6px; font-size: 12px; border-radius: 8px; }
.records-page-navigation { display: flex; align-items: center; gap: 1px; }
.records-page-count { padding-inline: 5px; white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
