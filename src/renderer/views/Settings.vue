<script setup>
import { computed, onMounted, ref } from 'vue'
import { KeyRound, LockKeyhole, Server, Wifi } from 'lucide-vue-next'

const config = ref({
  endpoint: 'arm-5:50051',
  apiKey: '',
  caCertificatePath: '',
  bundledCertificatePath: '',
  pageSize: 1000,
  connectionTimeoutMs: 10000,
  hasApiKey: false,
})
const indexStatus = ref(null)
const loading = ref(true)
const saving = ref(false)
const testing = ref(false)
const message = ref('')
const error = ref('')

const certificateLabel = computed(() =>
  config.value.caCertificatePath || `Встроенный: ${config.value.bundledCertificatePath}`
)

function draftConfig() {
  return {
    endpoint: config.value.endpoint,
    apiKey: config.value.apiKey,
    caCertificatePath: config.value.caCertificatePath,
    pageSize: config.value.pageSize,
    connectionTimeoutMs: config.value.connectionTimeoutMs,
  }
}

function applyPublicConfig(value) {
  config.value = { ...config.value, ...value, apiKey: '' }
}

async function loadConfig() {
  loading.value = true
  error.value = ''
  try {
    applyPublicConfig(await window.searchAPI.getConfig())
  } catch (reason) {
    error.value = reason?.message || String(reason)
  } finally {
    loading.value = false
  }
}

async function chooseCertificate() {
  const selected = await window.fileDialog.openCertificate()
  if (selected) config.value.caCertificatePath = selected
}

async function saveConfig() {
  saving.value = true
  message.value = ''
  error.value = ''
  try {
    applyPublicConfig(await window.searchAPI.setConfig(draftConfig()))
    message.value = 'Настройки подключения сохранены'
  } catch (reason) {
    error.value = reason?.message || String(reason)
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  message.value = ''
  error.value = ''
  try {
    indexStatus.value = await window.searchAPI.testConnection(draftConfig())
    message.value = 'TLS-соединение с сервером установлено'
  } catch (reason) {
    error.value = reason?.message || String(reason)
  } finally {
    testing.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.12),_transparent_36%),linear-gradient(145deg,#171717,#0a0a0a)] p-6 text-white">
    <div class="mx-auto max-w-4xl space-y-6">
      <header class="rounded-3xl border border-neutral-700/80 bg-neutral-900/80 p-7 shadow-2xl backdrop-blur-xl">
        <div class="flex items-start gap-4">
          <div class="rounded-2xl bg-green-500/15 p-3 text-green-400"><Server class="h-7 w-7" /></div>
          <div>
            <h1 class="text-2xl font-bold tracking-tight">Сервер поиска</h1>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              Приложение выполняет поиск только через защищенный gRPC API. Manticore и MariaDB
              остаются на сервере и не требуют локального каталога базы.
            </p>
          </div>
        </div>
      </header>

      <section class="grid gap-5 rounded-3xl border border-neutral-700/80 bg-neutral-900/80 p-7 shadow-xl md:grid-cols-2">
        <label class="space-y-2 text-sm text-neutral-300">
          <span class="flex items-center gap-2 font-medium"><Wifi class="h-4 w-4" />Адрес gRPC</span>
          <input v-model.trim="config.endpoint" :disabled="loading" placeholder="arm-5:50051" class="w-full rounded-xl border border-neutral-600 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-green-500">
        </label>

        <label class="space-y-2 text-sm text-neutral-300">
          <span class="flex items-center gap-2 font-medium"><KeyRound class="h-4 w-4" />API-ключ</span>
          <input v-model="config.apiKey" type="password" autocomplete="off" :placeholder="config.hasApiKey ? 'Ключ сохранен, оставьте поле пустым' : 'Введите API-ключ'" class="w-full rounded-xl border border-neutral-600 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-green-500">
        </label>

        <label class="space-y-2 text-sm text-neutral-300">
          <span class="font-medium">Размер страницы потока</span>
          <input v-model.number="config.pageSize" type="number" min="50" max="10000" class="w-full rounded-xl border border-neutral-600 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-green-500">
          <span class="block text-xs leading-5 text-neutral-500">Это не лимит результатов. Сервер передаст все совпадения страницами указанного размера.</span>
        </label>

        <label class="space-y-2 text-sm text-neutral-300">
          <span class="font-medium">Тайм-аут подключения, мс</span>
          <input v-model.number="config.connectionTimeoutMs" type="number" min="1000" max="120000" step="1000" class="w-full rounded-xl border border-neutral-600 bg-neutral-950 px-4 py-3 text-white outline-none transition focus:border-green-500">
        </label>

        <div class="space-y-3 md:col-span-2">
          <div class="flex items-center gap-2 text-sm font-medium text-neutral-300"><LockKeyhole class="h-4 w-4" />TLS-сертификат сервера</div>
          <div class="break-all rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs text-neutral-400">{{ certificateLabel }}</div>
          <div class="flex flex-wrap gap-3">
            <button class="rounded-xl bg-neutral-700 px-4 py-2 text-sm font-semibold transition hover:bg-neutral-600" @click="chooseCertificate">Выбрать сертификат</button>
            <button class="rounded-xl border border-neutral-600 px-4 py-2 text-sm transition hover:border-neutral-400" @click="config.caCertificatePath = ''">Использовать встроенный</button>
          </div>
        </div>

        <div class="flex flex-wrap gap-3 md:col-span-2">
          <button :disabled="saving || loading" class="rounded-xl bg-green-600 px-5 py-3 font-semibold transition hover:bg-green-500 disabled:opacity-50" @click="saveConfig">{{ saving ? 'Сохранение...' : 'Сохранить' }}</button>
          <button :disabled="testing || loading" class="rounded-xl bg-neutral-700 px-5 py-3 font-semibold transition hover:bg-neutral-600 disabled:opacity-50" @click="testConnection">{{ testing ? 'Проверка...' : 'Проверить соединение' }}</button>
        </div>
      </section>

      <div v-if="message" class="rounded-2xl border border-green-600/50 bg-green-950/30 px-5 py-4 text-sm text-green-300">{{ message }}</div>
      <div v-if="error" class="rounded-2xl border border-red-500/50 bg-red-950/30 px-5 py-4 text-sm text-red-200">{{ error }}</div>

      <section v-if="indexStatus" class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-6">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p class="text-xs uppercase tracking-[0.2em] text-neutral-500">Индекс Manticore</p>
            <h2 class="mt-1 text-xl font-semibold">{{ indexStatus.status || 'unknown' }}</h2>
          </div>
          <p class="text-3xl font-bold text-green-400">{{ Number(indexStatus.progress_percent || 0).toFixed(1) }}%</p>
        </div>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full bg-green-500 transition-all" :style="{ width: `${Math.min(Number(indexStatus.progress_percent || 0), 100)}%` }"></div></div>
        <p class="mt-3 text-sm text-neutral-400">Готово шардов: {{ indexStatus.indexed_shards }}/{{ indexStatus.total_shards }}</p>
      </section>
    </div>
  </div>
</template>
