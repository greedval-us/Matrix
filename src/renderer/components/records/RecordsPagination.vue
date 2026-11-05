<script setup>
import { computed, useId } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
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
      {{ numberFormat.format(firstRecord) }}–{{ numberFormat.format(lastRecord) }}
      из {{ numberFormat.format(total) }}
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
      <button
        type="button"
        class="mx-icon-button"
        aria-label="Предыдущая страница"
        :disabled="loading || page <= 1"
        @click="emit('page', page - 1)"
      >
        <ChevronLeft aria-hidden="true" class="h-4 w-4" />
      </button>
      <span class="records-page-count">Страница {{ page }} из {{ pageCount }}</span>
      <button
        type="button"
        class="mx-icon-button"
        aria-label="Следующая страница"
        :disabled="loading || page >= pageCount"
        @click="emit('page', page + 1)"
      >
        <ChevronRight aria-hidden="true" class="h-4 w-4" />
      </button>
    </nav>
  </footer>
</template>

<style scoped>
.records-pagination { display: flex; align-items: center; flex-wrap: wrap; gap: 14px 20px; padding: 16px 2px 0; color: var(--mx-muted); font-size: 12px; }
.records-range { margin-right: auto; font-variant-numeric: tabular-nums; }
.records-page-size { display: flex; align-items: center; gap: 10px; }
.records-page-select { width: 74px; min-height: 36px; padding: 6px 9px; font-size: 12px; border-radius: 9px; }
.records-page-navigation { display: flex; align-items: center; gap: 6px; }
.records-page-count { white-space: nowrap; font-variant-numeric: tabular-nums; }
</style>
