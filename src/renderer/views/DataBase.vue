<script setup>
import { onMounted } from 'vue';
import { RefreshCw, ArrowDown, ArrowUp, Database } from 'lucide-vue-next';
import { useDatabaseStore } from '../stores/uistore/databaseStoreUI';
import PageHeading from '../components/ui/PageHeading.vue';
const dbStore = useDatabaseStore();
const columns = [
  { key: 'name', label: 'Источник' },
  { key: 'info', label: 'Описание' },
  { key: 'relevance_date', label: 'Актуальность' },
  { key: 'type', label: 'Тип' },
  { key: 'count', label: 'Записей' },
  { key: 'trust', label: 'Доступность' },
];
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
    <div class="mb-5 flex flex-wrap items-end justify-between gap-4">
      <label class="space-y-2 text-sm"
        ><span class="block text-matrix-muted">Тип источника</span
        ><select
          :value="dbStore.state.selectedType"
          class="mx-input min-w-[180px]"
          @change="dbStore.setFilter($event.target.value)"
        >
          <option v-for="type in dbStore.types" :key="type">{{ type }}</option>
        </select></label
      >
      <div class="flex gap-4 text-sm text-matrix-muted">
        <p>
          <strong class="mr-1 text-matrix-text">{{ dbStore.filteredRowCount }}</strong
          >источников
        </p>
        <p>
          <strong class="mr-1 text-matrix-text">{{
            dbStore.filteredCountSum.toLocaleString('ru-RU')
          }}</strong
          >записей
        </p>
      </div>
    </div>
    <div class="mx-panel min-h-[240px] flex-1 overflow-auto">
      <table class="w-full min-w-[800px] text-left text-sm">
        <thead class="sticky top-0 z-10 bg-matrix-raised text-matrix-muted">
          <tr>
            <th
              v-for="column in columns"
              :key="column.key"
              class="px-4 py-3 font-medium"
              :aria-sort="
                dbStore.state.sortKey === column.key
                  ? dbStore.state.sortDirection === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : 'none'
              "
            >
              <button
                class="flex items-center gap-2 text-left"
                @click="dbStore.setSort(column.key)"
              >
                {{ column.label
                }}<component
                  v-if="dbStore.state.sortKey === column.key"
                  :is="dbStore.state.sortDirection === 'asc' ? ArrowUp : ArrowDown"
                  class="h-3 w-3"
                />
              </button>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-matrix-border">
          <tr
            v-for="row in dbStore.filteredRows"
            :key="row.name_table"
            class="hover:bg-matrix-raised/50"
          >
            <td class="max-w-[230px] break-words px-4 py-4 font-medium text-matrix-text">
              {{ row.name }}
            </td>
            <td
              class="max-w-[350px] whitespace-pre-wrap break-words px-4 py-4 leading-6 text-matrix-muted"
            >
              {{ row.info }}
            </td>
            <td class="whitespace-nowrap px-4 py-4 text-matrix-muted">
              {{ row.relevance_date || 'Не указана' }}
            </td>
            <td class="px-4 py-4 text-matrix-muted">{{ row.type || 'Не указан' }}</td>
            <td class="px-4 py-4 tabular-nums text-matrix-secondary">
              {{ Number(row.count || 0).toLocaleString('ru-RU') }}
            </td>
            <td class="px-4 py-4">
              <span
                class="mx-badge"
                :class="
                  row.trust === '1'
                    ? '!border-matrix-accent/20 !text-matrix-accent'
                    : '!text-matrix-muted'
                "
                >{{ row.trust === '1' ? 'Доступна' : 'Недоступна' }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="dbStore.state.loading" role="status" class="mx-empty">Загружаем каталог…</div>
      <div v-else-if="!dbStore.filteredRows.length && !dbStore.state.error" class="mx-empty">
        <Database aria-hidden="true" class="mx-auto mb-3 h-6 w-6 text-matrix-muted" />Нет источников
        для выбранного фильтра.
      </div>
    </div>
  </div>
</template>
