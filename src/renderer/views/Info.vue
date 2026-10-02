<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Database, RefreshCw, Search, Server, ShieldCheck } from 'lucide-vue-next'

const status = ref(null)
const config = ref(null)
const loading = ref(false)
const error = ref('')
let refreshTimer = null

const progress = computed(() => Math.min(Number(status.value?.progress_percent || 0), 100))

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const [nextConfig, nextStatus] = await Promise.all([
      window.searchAPI.getConfig(),
      window.searchAPI.getIndexStatus(),
    ])
    config.value = nextConfig
    status.value = nextStatus
  } catch (reason) {
    error.value = reason?.message || String(reason)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(refresh, 15000)
})
onBeforeUnmount(() => window.clearInterval(refreshTimer))
</script>

<template>
  <div class="h-full overflow-y-auto bg-[radial-gradient(circle_at_15%_10%,_rgba(34,197,94,0.1),_transparent_30%),linear-gradient(150deg,#171717,#090909)] p-6 text-white">
    <div class="mx-auto max-w-5xl space-y-6">
      <section class="rounded-3xl border border-neutral-700/80 bg-neutral-900/80 p-7 shadow-2xl">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.25em] text-green-400">Matrix Search</p>
            <h1 class="mt-2 text-3xl font-bold">Состояние поисковой системы</h1>
            <p class="mt-2 text-sm text-neutral-400">Клиент gRPC получает готовые результаты из Manticore. MariaDB используется сервером только при построении индексов.</p>
          </div>
          <button :disabled="loading" class="flex items-center gap-2 rounded-xl bg-neutral-700 px-4 py-2 text-sm transition hover:bg-neutral-600 disabled:opacity-50" @click="refresh"><RefreshCw class="h-4 w-4" :class="{ 'animate-spin': loading }" />Обновить</button>
        </div>
      </section>

      <div v-if="error" class="rounded-2xl border border-red-500/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{{ error }}</div>

      <section class="grid gap-4 md:grid-cols-3">
        <article class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5"><Server class="h-6 w-6 text-green-400" /><p class="mt-4 text-xs uppercase tracking-wider text-neutral-500">gRPC сервер</p><p class="mt-1 break-all font-semibold">{{ config?.endpoint || 'Не настроен' }}</p></article>
        <article class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5"><ShieldCheck class="h-6 w-6 text-green-400" /><p class="mt-4 text-xs uppercase tracking-wider text-neutral-500">Защита</p><p class="mt-1 font-semibold">TLS + API-ключ</p></article>
        <article class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5"><Search class="h-6 w-6 text-green-400" /><p class="mt-4 text-xs uppercase tracking-wider text-neutral-500">Выдача</p><p class="mt-1 font-semibold">Все совпадения потоком</p></article>
      </section>

      <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-7">
        <div class="flex flex-wrap items-end justify-between gap-4">
          <div class="flex items-center gap-3"><Database class="h-7 w-7 text-green-400" /><div><p class="text-xs uppercase tracking-wider text-neutral-500">Индекс Manticore</p><h2 class="text-xl font-semibold">{{ status?.status || 'Нет соединения' }}</h2></div></div>
          <p class="text-4xl font-bold text-green-400">{{ progress.toFixed(1) }}%</p>
        </div>
        <div class="mt-5 h-3 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full bg-gradient-to-r from-green-700 to-green-400 transition-all duration-700" :style="{ width: `${progress}%` }"></div></div>
        <div class="mt-4 grid gap-3 text-sm text-neutral-300 sm:grid-cols-3"><p>Готово: <strong class="text-white">{{ status?.indexed_shards || 0 }}/{{ status?.total_shards || 0 }}</strong></p><p>Текущий шард: <strong class="text-white">{{ status?.current_shard || 0 }}</strong></p><p>Обновлено: <strong class="text-white">{{ status?.updated_at || 'нет данных' }}</strong></p></div>
      </section>
    </div>
  </div>
</template>
