<script setup>
import { computed, shallowRef } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
import { key as fieldLabels } from '../../../shared/constants/translateKey.js';

const IDENTIFIER_PREVIEW_SIZE = 12;
const SOURCE_PREVIEW_SIZE = 8;
const props = defineProps({ report: { type: Object, required: true } });
const expanded = shallowRef(false);
const identifiers = computed(() => props.report.identifiers || []);
const sources = computed(() => props.report.sources || []);
const aggregateCount = computed(() => props.report.aggregates?.length || 0);
const visibleIdentifiers = computed(() => expanded.value ? identifiers.value : identifiers.value.slice(0, IDENTIFIER_PREVIEW_SIZE));
const visibleSources = computed(() => expanded.value ? sources.value : sources.value.slice(0, SOURCE_PREVIEW_SIZE));
const hasMore = computed(() => !expanded.value && (identifiers.value.length > IDENTIFIER_PREVIEW_SIZE || sources.value.length > SOURCE_PREVIEW_SIZE));
const seed = computed(() => Object.entries(props.report.seedQuery || {})
  .map(([field, value]) => `${fieldLabels[field] || field}: ${value}`).join(' · '));
</script>

<template>
  <details class="report-summary border-t border-matrix-border pt-4" open>
    <summary class="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-matrix-secondary">
      Найденные значения и источники<ChevronDown aria-hidden="true" class="ml-auto h-3.5 w-3.5" />
    </summary>
    <div class="mt-4 space-y-4">
      <p v-if="seed" class="report-seed break-words text-xs leading-5 text-matrix-muted">Исходный запрос: {{ seed }}</p>
      <p v-if="aggregateCount" class="report-aggregate-summary text-xs leading-5 text-matrix-muted">
        Сводные данные сервера: {{ aggregateCount }}. Сгруппированные значения и счётчики включены в DOCX отдельно от записей.
      </p>
      <dl v-if="identifiers.length" class="report-identifiers grid gap-2 sm:grid-cols-2">
        <div v-for="identifier in visibleIdentifiers" :key="JSON.stringify([identifier.field, identifier.value])"
          class="report-identifier min-w-0 rounded-xl px-3 py-2.5">
          <dt class="text-[11px] text-matrix-muted">{{ fieldLabels[identifier.field] || identifier.field }}</dt>
          <dd class="mt-1 break-words text-[13px] font-medium text-matrix-secondary">{{ identifier.value }}</dd>
        </div>
      </dl>
      <p v-else class="text-xs leading-5 text-matrix-muted">Дополнительные точные идентификаторы не найдены.</p>
      <div v-if="sources.length" class="space-y-2">
        <p class="text-xs font-medium text-matrix-secondary">Источники</p>
        <ul class="flex flex-wrap gap-2" aria-label="Источники отчёта">
          <li v-for="source in visibleSources" :key="source.id" class="mx-badge report-source" :title="source.info || source.name">
            {{ source.name || source.id }}
          </li>
        </ul>
      </div>
      <button v-if="hasMore" type="button" class="mx-button !py-2 text-xs" @click="expanded = true">Показать все значения и источники</button>
      <p class="text-xs leading-5 text-matrix-muted">Полные записи, связи и ход поиска включены в DOCX. Совпадение идентификаторов само по себе не подтверждает принадлежность данных одному человеку.</p>
    </div>
  </details>
</template>

<style scoped>
.report-identifier { background: rgb(var(--mx-raised-rgb) / 0.6); }
.report-source { white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
</style>
