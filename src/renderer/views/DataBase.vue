<script setup>
import { onMounted } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { useDatabaseStore } from '../stores/uistore/databaseStoreUI';
import PageHeading from '../components/ui/PageHeading.vue';
import CatalogFilters from '../components/catalog/CatalogFilters.vue';
import CatalogTable from '../components/catalog/CatalogTable.vue';
const dbStore = useDatabaseStore();
onMounted(() => {
  if (!dbStore.state.rows.length && !dbStore.state.loading) dbStore.fetchAll();
});
</script>

<template>
  <div class="mx-page mx-auto flex h-full min-h-0 max-w-[1500px] flex-col">
    <PageHeading
      title="Каталог источников"
      description="Доступные базы, их актуальность и объём данных."
      ><button class="mx-button" :disabled="dbStore.state.loading" @click="dbStore.fetchAll()">
        <RefreshCw
          aria-hidden="true"
          class="h-4 w-4"
          :class="{ 'animate-spin': dbStore.state.loading }"
        />Обновить
      </button></PageHeading
    >
    <p v-if="dbStore.state.error" role="alert" class="mx-alert mb-5">{{ dbStore.state.error }}</p>
    <CatalogFilters :types="dbStore.types" :selected-type="dbStore.state.selectedType"
      :row-count="dbStore.filteredRowCount" :record-count="dbStore.filteredCountSum" @filter="dbStore.setFilter" />
    <CatalogTable :rows="dbStore.filteredRows" :loading="dbStore.state.loading" :error="dbStore.state.error"
      :sort-key="dbStore.state.sortKey" :sort-direction="dbStore.state.sortDirection" @sort="dbStore.setSort" />
  </div>
</template>
