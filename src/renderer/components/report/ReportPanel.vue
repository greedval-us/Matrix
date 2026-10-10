<script setup>
import { computed } from 'vue';
import { FileText, LoaderCircle, Square, Download, AlertCircle, CheckCircle2 } from 'lucide-vue-next';
import { key as fieldLabels } from '../../../shared/constants/translateKey.js';
import ReportSummary from './ReportSummary.vue';

const props = defineProps({ state: { type: Object, required: true } });
const emit = defineEmits(['cancel', 'save']);
const report = computed(() => props.state.report);
const stats = computed(() => report.value?.stats || props.state.progress?.stats || {});
const aggregateCount = computed(() => stats.value.aggregates || report.value?.aggregates?.length || 0);
const warnings = computed(() => [...new Set(report.value?.warnings || props.state.progress?.warnings || [])]);
const partial = computed(() => report.value && !report.value.complete);
const title = computed(() => props.state.loading
  ? props.state.stopping ? 'Останавливаем сбор отчёта…' : 'Собираем отчёт'
  : report.value?.cancelled ? 'Сбор отчёта остановлен'
    : partial.value ? 'Отчёт собран частично' : report.value ? 'Отчёт готов' : 'Сбор отчёта');
const currentQuery = computed(() => Object.entries(props.state.progress?.query?.query || {})
  .filter(([, value]) => value)
  .map(([field, value]) => `${fieldLabels[field] || field}: ${value}`).join(' · '));
const number = (value) => new Intl.NumberFormat('ru-RU').format(Number(value) || 0);
</script>

<template>
  <section class="mx-panel report-panel min-w-0 space-y-4 p-5" aria-label="Сбор отчёта">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <span class="report-heading-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl">
          <LoaderCircle v-if="state.loading" aria-hidden="true" class="h-5 w-5 animate-spin text-matrix-accent" />
          <AlertCircle v-else-if="partial || state.error" aria-hidden="true" class="h-5 w-5 text-matrix-accent" />
          <CheckCircle2 v-else-if="report" aria-hidden="true" class="h-5 w-5 text-matrix-accent" />
          <FileText v-else aria-hidden="true" class="h-5 w-5 text-matrix-accent" />
        </span>
        <div class="min-w-0">
          <h3 class="text-base font-semibold tracking-tight">{{ title }}</h3>
          <p class="mt-1 text-xs leading-5 text-matrix-muted">Данные и их источники объединяются без повторов.</p>
        </div>
      </div>
      <button v-if="state.loading" type="button" class="mx-button report-cancel-action !py-2 text-xs"
        :disabled="state.stopping" @click="emit('cancel')">
        <Square aria-hidden="true" class="h-3 w-3 fill-current" />
        {{ state.stopping ? 'Останавливаем…' : 'Остановить сбор' }}
      </button>
      <button v-else-if="report" type="button" class="mx-button mx-button-primary report-save-action !py-2 text-xs"
        :disabled="state.saving" @click="emit('save')">
        <LoaderCircle v-if="state.saving" aria-hidden="true" class="h-3.5 w-3.5 animate-spin" />
        <Download v-else aria-hidden="true" class="h-3.5 w-3.5" />
        {{ state.saving ? 'Сохраняем…' : 'Сохранить DOCX' }}
      </button>
    </div>
    <div v-if="state.loading || report" class="report-progress space-y-3" role="status" aria-live="polite">
      <p v-if="state.loading && currentQuery" class="break-words text-xs leading-5 text-matrix-muted">Проверяем {{ currentQuery }}</p>
      <dl class="report-statistics grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt>Запросов</dt><dd>{{ number(stats.queries) }}</dd></div>
        <div><dt>Записей</dt><dd>{{ number(stats.records) }}</dd></div>
        <div><dt>Источников</dt><dd>{{ number(stats.sources) }}</dd></div>
        <div><dt>Повторов убрано</dt><dd>{{ number(stats.duplicates) }}</dd></div>
        <div v-if="aggregateCount"><dt>Сводок сервера</dt><dd>{{ number(aggregateCount) }}</dd></div>
      </dl>
      <p v-if="state.loading && stats.pendingQueries" class="text-xs text-matrix-muted">Ожидают проверки: {{ number(stats.pendingQueries) }}</p>
    </div>
    <p v-if="state.error" class="mx-alert text-sm" role="alert">{{ state.error }}</p>
    <p v-if="state.notice" class="mx-alert mx-success text-sm" role="status">{{ state.notice }}</p>
    <div v-if="warnings.length || partial" class="report-warnings space-y-2 rounded-xl p-3 text-xs leading-5" role="status">
      <p v-if="partial" class="font-medium text-matrix-secondary">Сохранить можно уже найденные данные. Полнота сбора не подтверждена.</p>
      <ul v-if="warnings.length" class="list-inside list-disc space-y-1 text-matrix-muted">
        <li v-for="warning in warnings" :key="warning">{{ warning }}</li>
      </ul>
    </div>
    <ReportSummary v-if="report" :report="report" />
  </section>
</template>

<style scoped>
.report-panel { border-color: rgb(var(--mx-accent-rgb) / 0.22); }
.report-heading-icon { background: rgb(var(--mx-accent-rgb) / 0.08); }
.report-statistics { padding-top: 2px; }
.report-statistics dt { color: rgb(var(--mx-muted-rgb)); font-size: 11px; line-height: 1.5; }
.report-statistics dd { margin-top: 4px; font-size: 20px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; }
.report-warnings { background: rgb(var(--mx-raised-rgb) / 0.75); border: 1px solid rgb(var(--mx-border-rgb) / 0.8); }
</style>
