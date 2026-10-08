<script setup>
import { ArrowDown, ArrowUp, Database } from 'lucide-vue-next';
import { CATALOG_COLUMNS as columns, SORT_ASCENDING } from '../../utils/catalog.js';
import { SOURCE_AVAILABLE_TRUST, formatResultCount } from '../../constants/resultPresentation.js';
defineProps({ rows: { type: Array, required: true }, loading: { type: Boolean, default: false }, error: { type: String, default: null }, sortKey: { type: String, default: null }, sortDirection: { type: String, required: true } });
const emit = defineEmits(['sort']);
</script>

<template>
  <div class="mx-panel min-h-[240px] flex-1 overflow-auto">
    <table class="w-full min-w-[800px] text-left text-sm">
      <thead class="sticky top-0 z-10 bg-matrix-raised text-matrix-muted">
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="px-4 py-3 font-medium"
            :aria-sort="
              sortKey === column.key
                ? sortDirection === SORT_ASCENDING
                  ? 'ascending'
                  : 'descending'
                : 'none'
            "
          >
            <button
              class="flex items-center gap-2 text-left"
              @click="emit('sort', column.key)"
            >
              {{ column.label
              }}<component
                v-if="sortKey === column.key"
                :is="sortDirection === SORT_ASCENDING ? ArrowUp : ArrowDown"
                class="h-3 w-3"
              />
            </button>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-matrix-border">
        <tr
          v-for="row in rows"
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
            {{ formatResultCount(row.count) }}
          </td>
          <td class="px-4 py-4">
            <span
              class="mx-badge"
              :class="
                row.trust === SOURCE_AVAILABLE_TRUST
                  ? '!border-matrix-accent/20 !text-matrix-accent'
                  : '!text-matrix-muted'
              "
              >{{ row.trust === SOURCE_AVAILABLE_TRUST ? 'Доступна' : 'Недоступна' }}</span
            >
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="loading" role="status" class="mx-empty">Загружаем каталог…</div>
    <div v-else-if="!rows.length && !error" class="mx-empty">
      <Database aria-hidden="true" class="mx-auto mb-3 h-6 w-6 text-matrix-muted" />Нет источников
      для выбранного фильтра.
    </div>
  </div>
</template>
