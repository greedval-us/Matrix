<script setup>
import { onMounted, onBeforeUnmount, computed } from 'vue'
import { useTabStore } from '../../stores/tabStore'
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI'
import MenegerExport from '../../services/export/MenegerExport'
import { Search } from 'lucide-vue-next'

const tabStore = useTabStore()
const searchUI = useSearchUIStore()
const exporter = new MenegerExport()

const activeTabId = computed(() => tabStore.state.activeTabId)
const selectedFields = computed(() => searchUI.getSelectedFields(activeTabId.value))
const results = computed(() => searchUI.getResults(activeTabId.value))
const loading = computed(() => searchUI.getLoading(activeTabId.value))
const hasSelectedFields = computed(() => Object.keys(selectedFields.value).length > 0)

const handleExport = (format) => {
  if (!results.value || !results.value.length) return
  exporter.export(results.value, format)
}

const handleSearch = async () => {
  if (!hasSelectedFields.value || loading.value) return
  await searchUI.search(activeTabId.value)
}

const onKeyDown = (e) => {
  if (e.key === 'Enter') {
    handleSearch()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
<div class="flex justify-between items-center gap-2 mt-4">
  <div class="flex gap-2">
    <button
      class="px-3 py-1.5 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white rounded-xl text-sm shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="results.length === 0"
      @click="() => handleExport('csv')"
      title="Сохранить в CSV"
    >
      CSV
    </button>

    <button
      class="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white rounded-xl text-sm shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="results.length === 0"
      @click="() => handleExport('excel')"
      title="Сохранить в EXCEL"
    >
      Excel
    </button>

    <button
      class="px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white rounded-xl text-sm shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="results.length === 0"
      @click="() => handleExport('pdf')"
      title="Сохранить в PDF"
    >
      PDF
    </button>

    <button
      class="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white rounded-xl text-sm shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      :disabled="results.length === 0"
      @click="() => handleExport('txt')"
      title="Сохранить в TXT"
    >
      TXT
    </button>
  </div>

  <button
    :disabled="!hasSelectedFields || loading"
    @click="handleSearch"
    class="flex items-center justify-center w-10 h-10 bg-neutral-800 hover:bg-neutral-700 disabled:bg-neutral-900 disabled:cursor-not-allowed text-white rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
    title="Найти"
  >
    <Search v-if="!loading" class="w-5 h-5"/>
    <span v-else class="loader w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
  </button>

</div>
</template>

<style scoped>
.loader {
  border-radius: 50%;
  border-width: 2px;
  width: 1.25rem;
  height: 1.25rem;
  border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
