<script setup>
import { storeToRefs } from 'pinia';
import { usePackagesSearchStoreUI } from '../stores/uistore/packejesSearchStoreUI.js';
import PageHeading from '../components/ui/PageHeading.vue';
import PackageSearchForm from '../components/packages/PackageSearchForm.vue';
import PackageSearchLog from '../components/packages/PackageSearchLog.vue';
const store = usePackagesSearchStoreUI();
const { queryText, searchField, formats, logs, isRunning, mode } = storeToRefs(store);
</script>

<template>
  <div class="mx-page mx-auto max-w-[1400px]">
    <PageHeading
      title="Пакетный поиск"
      description="Добавьте список значений: один запрос в каждой строке. Результаты сохранятся в выбранную папку."
    />
    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <PackageSearchForm
        v-model:mode="mode"
        v-model:query-text="queryText" v-model:search-field="searchField" v-model:formats="formats"
        :is-running="isRunning" @search="store.runSearch" @open-file="store.openFile" @cancel="store.cancelSearch"
      />
      <PackageSearchLog :logs="logs" :is-running="isRunning" />
    </div>
  </div>
</template>
