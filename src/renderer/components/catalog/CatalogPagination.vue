<script setup>
import { computed } from 'vue';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';
import { CATALOG_PAGE_SIZE } from '../../utils/catalog.js';
import { formatResultCount } from '../../constants/resultPresentation.js';

const props = defineProps({
  page: { type: Number, required: true },
  pageCount: { type: Number, required: true },
  total: { type: Number, required: true },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(['page']);
const firstSource = computed(() => props.total ? (props.page - 1) * CATALOG_PAGE_SIZE + 1 : 0);
const lastSource = computed(() => Math.min(props.page * CATALOG_PAGE_SIZE, props.total));
</script>

<template>
  <footer class="catalog-pagination">
    <p role="status" class="catalog-page-range">
      {{ formatResultCount(firstSource) }}–{{ formatResultCount(lastSource) }} из {{ formatResultCount(total) }}
    </p>
    <nav aria-label="Страницы каталога" class="catalog-page-navigation">
      <button
        type="button"
        class="mx-icon-button"
        aria-label="Предыдущая страница"
        :disabled="loading || page <= 1"
        @click="emit('page', page - 1)"
      >
        <ChevronLeft aria-hidden="true" class="h-4 w-4" />
      </button>
      <span class="catalog-page-count">Страница {{ page }} из {{ pageCount }}</span>
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
.catalog-pagination { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; flex-shrink: 0; gap: 8px 20px; padding: 12px 2px 0; color: var(--mx-muted); font-size: 12px; }
.catalog-page-range, .catalog-page-count { font-variant-numeric: tabular-nums; white-space: nowrap; }
.catalog-page-navigation { display: flex; align-items: center; gap: 6px; }
</style>
