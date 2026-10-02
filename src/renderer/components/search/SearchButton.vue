<script setup>
import { computed, ref } from 'vue';
import { Search, Square, Download, LoaderCircle } from 'lucide-vue-next';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const exporting = ref(false);
const exportFormat = ref('csv');
const exportError = ref('');
const fields = computed(() => searchUI.getSelectedFields(props.tabId));
const loading = computed(() => searchUI.getLoading(props.tabId));
const results = computed(() => searchUI.getResults(props.tabId));
const hasSearchValue = computed(() =>
  Object.values(fields.value).some((field) => String(field?.value || '').trim()),
);
const hasRecords = computed(() => results.value.some((item) => item.type === 'object_data'));
let exporter;
async function handleExport() {
  exportError.value = '';
  exporting.value = true;
  try {
    if (!exporter) {
      const { default: ExportManager } = await import('../../services/export/MenegerExport');
      exporter = new ExportManager();
    }
    await exporter.export(results.value, exportFormat.value);
  } catch (error) {
    exportError.value = error?.message || 'Не удалось сохранить файл';
  } finally {
    exporting.value = false;
  }
}
function handleSearch() {
  if (loading.value) searchUI.cancelSearch(props.tabId);
  else if (hasSearchValue.value) searchUI.search(props.tabId);
}
</script>

<template>
  <div class="space-y-3">
    <button
      type="submit"
      class="mx-button mx-button-primary w-full !py-3"
      :disabled="!hasSearchValue && !loading"
      @click.prevent="handleSearch"
    >
      <Square aria-hidden="true" v-if="loading" class="h-3.5 w-3.5 fill-current" /><Search
        aria-hidden="true"
        v-else
        class="h-4 w-4"
      />
      {{ loading ? 'Остановить поиск' : 'Найти совпадения' }}
      <kbd
        v-if="!loading"
        class="ml-auto hidden rounded border border-matrix-on-accent/30 px-1.5 text-xs sm:inline"
        >Enter</kbd
      >
    </button>
    <div class="flex items-center gap-2">
      <select
        v-model="exportFormat"
        class="mx-input !w-24 !py-2 text-xs"
        aria-label="Формат экспорта"
      >
        <option value="csv">CSV</option>
        <option value="excel">Excel</option>
        <option value="pdf">PDF</option>
        <option value="txt">TXT</option>
      </select>
      <button
        type="button"
        class="mx-button flex-1 !py-2 text-xs"
        :disabled="!hasRecords || loading || exporting"
        @click="handleExport"
      >
        <LoaderCircle
          aria-hidden="true"
          v-if="exporting"
          class="h-3.5 w-3.5 animate-spin"
        /><Download aria-hidden="true" v-else class="h-3.5 w-3.5" />Экспорт
      </button>
    </div>
    <p v-if="exportError" role="alert" class="text-xs text-rose-300">{{ exportError }}</p>
  </div>
</template>
