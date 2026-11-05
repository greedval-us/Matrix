<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { RefreshCw, Database, Server, ShieldCheck } from 'lucide-vue-next';
import PageHeading from '../components/ui/PageHeading.vue';
import { useIndexStatus, PERCENT_COMPLETE } from '../composables/useIndexStatus.js';

const { status, config, loading, error, progress, refresh, start, stop } = useIndexStatus();
onMounted(start);
onBeforeUnmount(stop);
</script>

<template>
  <div class="mx-page mx-auto max-w-5xl">
    <PageHeading
      title="Состояние системы"
      description="Подключение к серверу и готовность данных для поиска."
      ><button class="mx-button" :disabled="loading" @click="refresh">
        <RefreshCw
          aria-hidden="true"
          class="h-4 w-4"
          :class="{ 'animate-spin': loading }"
        />Обновить
      </button></PageHeading
    >
    <p v-if="error" role="alert" class="mx-alert mb-5">{{ error }}</p>
    <div class="mb-6 grid gap-4 sm:grid-cols-2">
      <div class="mx-panel p-5">
        <Server class="h-5 w-5 text-matrix-accent" />
        <p class="mx-eyebrow mt-5">Сервер поиска</p>
        <p class="mt-2 break-all text-sm font-medium">{{ config?.endpoint || 'Не настроен' }}</p>
      </div>
      <div class="mx-panel p-5">
        <ShieldCheck aria-hidden="true" class="h-5 w-5 text-matrix-accent" />
        <p class="mx-eyebrow mt-5">Доступ</p>
        <p class="mt-2 text-sm font-medium">
          {{ config?.hasApiKey ? 'Ключ настроен · TLS' : 'Требуется API-ключ' }}
        </p>
      </div>
    </div>
    <section class="mx-panel p-6">
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div class="flex items-center gap-3">
          <Database aria-hidden="true" class="h-5 w-5 text-matrix-accent" />
          <div>
            <h2 class="text-sm font-semibold">Готовность поискового индекса</h2>
            <p class="mt-1 text-xs text-matrix-muted">
              {{ status?.status || (loading ? 'Проверяем состояние…' : 'Нет соединения') }}
            </p>
          </div>
        </div>
        <strong class="text-3xl font-semibold tabular-nums text-matrix-accent">{{
          status ? progress.toFixed(1) + '%' : '—'
        }}</strong>
      </div>
      <div
        class="mt-6 h-2 overflow-hidden rounded-full bg-matrix-border"
        role="progressbar"
        aria-label="Готовность индекса"
        :aria-valuenow="status ? progress : undefined"
        aria-valuemin="0"
        :aria-valuemax="PERCENT_COMPLETE"
      >
        <div
          class="h-full rounded-full bg-matrix-accent transition-[width] duration-500"
          :style="{ width: progress + '%' }"
        ></div>
      </div>
      <p class="mt-4 text-xs leading-6 text-matrix-muted">
        {{
          status
            ? 'Готово частей: ' + status.indexed_shards + ' из ' + status.total_shards
            : 'Состояние индекса станет доступно после подключения.'
        }}
      </p>
      <p v-if="status && progress < PERCENT_COMPLETE" class="mx-warning mt-4 text-sm">
        Индекс обновляется. Поиск работает по уже готовым данным; выдача может быть неполной.
      </p>
      <p v-if="status?.updated_at" class="mt-4 text-xs text-matrix-muted">
        Обновлено: {{ status.updated_at }}
      </p>
    </section>
  </div>
</template>
