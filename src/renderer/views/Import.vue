<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const sourceFolderPath = ref('')
const databaseRootPath = ref('')
const databaseStatus = ref(null)
const importStatus = ref(null)
const indexStatus = ref(null)
const error = ref('')
const isImporting = ref(false)
const isIndexing = ref(false)

let indexPollingTimer = null

const canImport = computed(() =>
  Boolean(sourceFolderPath.value) &&
  Boolean(databaseStatus.value?.initialized) &&
  !isImporting.value
)

const canBuildIndex = computed(() =>
  Boolean(databaseStatus.value?.initialized) &&
  !isImporting.value &&
  !isIndexing.value
)

const indexProgressPercent = computed(() => {
  const filesTotal = indexStatus.value?.filesTotal ?? 0
  const filesProcessed = indexStatus.value?.filesProcessed ?? 0

  if (!filesTotal) return 0

  return Math.min(100, Math.round((filesProcessed / filesTotal) * 100))
})

const databaseStatusText = computed(() => {
  if (!databaseStatus.value) return 'Статус локальной базы не загружен'
  if (databaseStatus.value.initialized) return 'Локальная база готова к импорту и индексации'
  if (databaseStatus.value.rootPath) return 'Локальная база еще не создана'
  return 'Сначала выберите каталог базы в настройках'
})

const indexStatusText = computed(() => {
  if (!indexStatus.value) return 'Индексация еще не запускалась'
  if (indexStatus.value.status === 'running') return 'Индексация выполняется'
  if (indexStatus.value.status === 'failed') return 'Индексация завершилась с ошибкой'
  if (indexStatus.value.status === 'completed') return 'Индексация завершена'
  return 'Статус индексации неизвестен'
})

async function loadState() {
  databaseRootPath.value = await window.databaseStorageAPI.getRootPath()
  databaseStatus.value = await window.databaseStorageAPI.getStatus(databaseRootPath.value)
  importStatus.value = await window.importAPI.getLastStatus()
  indexStatus.value = await window.indexAPI.getLastStatus()

  if (indexStatus.value?.status === 'running') {
    isIndexing.value = true
    startIndexPolling()
  }
}

async function refreshIndexStatus() {
  indexStatus.value = await window.indexAPI.getLastStatus()

  if (!indexStatus.value || indexStatus.value.status !== 'running') {
    isIndexing.value = false
    stopIndexPolling()
  }
}

function startIndexPolling() {
  if (indexPollingTimer) return

  indexPollingTimer = window.setInterval(() => {
    refreshIndexStatus().catch((e) => {
      error.value = e.message || 'Ошибка обновления статуса индексации'
      console.error(e)
      stopIndexPolling()
    })
  }, 1000)
}

function stopIndexPolling() {
  if (!indexPollingTimer) return

  window.clearInterval(indexPollingTimer)
  indexPollingTimer = null
}

async function chooseImportFolder() {
  try {
    const selectedPath = await window.fileDialog.openFolder()
    if (!selectedPath) return
    sourceFolderPath.value = selectedPath
    error.value = ''
  } catch (e) {
    error.value = 'Не удалось выбрать папку импорта'
    console.error(e)
  }
}

async function runImport() {
  if (!canImport.value) return

  isImporting.value = true
  try {
    importStatus.value = await window.importAPI.runFolder(sourceFolderPath.value)
    indexStatus.value = await window.indexAPI.getLastStatus()
    error.value = ''
  } catch (e) {
    error.value = e.message || 'Ошибка импорта'
    console.error(e)
  } finally {
    isImporting.value = false
  }
}

async function buildIndex() {
  if (!canBuildIndex.value) return

  isIndexing.value = true
  error.value = ''

  try {
    startIndexPolling()
    indexStatus.value = await window.indexAPI.build()
  } catch (e) {
    error.value = e.message || 'Ошибка индексации'
    console.error(e)
  } finally {
    await refreshIndexStatus()
  }
}

onMounted(loadState)
onBeforeUnmount(stopIndexPolling)
</script>

<template>
  <div class="h-full overflow-y-auto bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 text-white">
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <h1 class="text-3xl font-bold">Импорт и индексация</h1>
        <p class="mt-2 text-sm text-neutral-400">
          Сначала импортируйте JSON-файлы в локальную базу, затем отдельным шагом постройте индексы
          для поиска по полям.
        </p>
      </div>

      <div class="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section class="space-y-5 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-xl">
          <div>
            <h2 class="text-xl font-semibold">Шаг 1. Импорт документов</h2>
            <p class="mt-1 text-sm text-neutral-400">Поддерживаются файлы `*.json` в выбранной папке.</p>
          </div>

          <div class="space-y-2">
            <label for="source-folder" class="text-sm font-medium text-neutral-300">Папка с файлами</label>
            <input
              id="source-folder"
              v-model="sourceFolderPath"
              placeholder="E:\\Imports"
              class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400"
            >
          </div>

          <div class="flex flex-wrap gap-3">
            <button
              @click="chooseImportFolder"
              class="rounded-2xl bg-neutral-700 px-5 py-3 font-semibold transition hover:bg-neutral-600"
            >
              Выбрать папку
            </button>
            <button
              @click="runImport"
              :disabled="!canImport"
              class="rounded-2xl bg-emerald-700 px-5 py-3 font-semibold transition hover:bg-emerald-600 disabled:bg-emerald-900/50"
            >
              {{ isImporting ? 'Импорт...' : 'Запустить импорт' }}
            </button>
            <button
              @click="loadState"
              class="rounded-2xl bg-neutral-800 px-5 py-3 font-semibold transition hover:bg-neutral-700"
            >
              Обновить
            </button>
          </div>
        </section>

        <section class="space-y-5 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-xl">
          <div>
            <h2 class="text-xl font-semibold">Локальная база</h2>
            <p class="mt-1 text-sm text-neutral-400">{{ databaseStatusText }}</p>
          </div>

          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4 text-sm">
            <div class="text-neutral-400">Путь базы</div>
            <div class="mt-1 break-all text-white">{{ databaseRootPath || 'Не выбран' }}</div>
          </div>

          <div v-if="error" class="rounded-2xl border border-red-500 bg-red-900/20 px-4 py-3 text-sm text-red-300">
            {{ error }}
          </div>
        </section>
      </div>

      <section class="space-y-5 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-xl">
        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 class="text-xl font-semibold">Шаг 2. Индексация</h2>
            <p class="mt-1 text-sm text-neutral-400">
              Индексатор читает документы из `documents/` и строит bucket-индексы в `indexes/`.
            </p>
          </div>

          <button
            @click="buildIndex"
            :disabled="!canBuildIndex"
            class="rounded-2xl bg-sky-700 px-5 py-3 font-semibold transition hover:bg-sky-600 disabled:bg-sky-900/50"
          >
            {{ isIndexing ? 'Индексация...' : 'Построить индекс' }}
          </button>
        </div>

        <div class="space-y-3 rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
          <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div class="text-neutral-300">{{ indexStatusText }}</div>
            <div class="text-neutral-400">{{ indexProgressPercent }}%</div>
          </div>

          <div class="h-3 overflow-hidden rounded-full bg-neutral-700">
            <div
              class="h-full rounded-full bg-sky-500 transition-all duration-300"
              :style="{ width: `${indexProgressPercent}%` }"
            />
          </div>

          <div v-if="indexStatus?.currentFile" class="break-all text-sm text-neutral-400">
            Текущий файл: {{ indexStatus.currentFile }}
          </div>

          <div v-if="indexStatus?.error" class="break-all text-sm text-red-300">
            {{ indexStatus.error }}
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Файлы</div>
            <div class="mt-2 text-sm text-white">
              {{ indexStatus?.filesProcessed ?? 0 }} / {{ indexStatus?.filesTotal ?? 0 }}
            </div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Документы</div>
            <div class="mt-2 text-sm text-white">{{ indexStatus?.indexedDocuments ?? 0 }}</div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Индекс-записи</div>
            <div class="mt-2 text-sm text-white">{{ indexStatus?.indexedEntries ?? 0 }}</div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Дата</div>
            <div class="mt-2 break-all text-sm text-white">{{ indexStatus?.indexedAt || '-' }}</div>
          </div>
        </div>
      </section>

      <section class="space-y-4 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-xl">
        <h2 class="text-xl font-semibold">Последний импорт</h2>

        <div v-if="!importStatus" class="text-sm text-neutral-400">
          Импорт еще не запускался.
        </div>

        <div v-else class="space-y-4">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Импорт</div>
              <div class="mt-2 text-sm text-white">{{ importStatus.importId || '-' }}</div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Файлы</div>
              <div class="mt-2 text-sm text-white">{{ importStatus.filesProcessed ?? 0 }}</div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Документы</div>
              <div class="mt-2 text-sm text-white">{{ importStatus.documentsImported ?? 0 }}</div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Дата</div>
              <div class="mt-2 break-all text-sm text-white">{{ importStatus.importedAt || '-' }}</div>
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Выходной файл</div>
            <div class="mt-2 break-all text-sm text-white">{{ importStatus.outputPath || '-' }}</div>
          </div>

          <div v-if="Array.isArray(importStatus.sources) && importStatus.sources.length" class="space-y-3">
            <div class="text-sm font-medium text-neutral-300">Источники</div>
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div
                v-for="source in importStatus.sources"
                :key="source.sourceTable"
                class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4"
              >
                <div class="text-sm font-semibold text-white">{{ source.sourceTable }}</div>
                <div class="mt-2 text-xs text-neutral-400">{{ source.fileName }}</div>
                <div class="mt-3 text-sm text-neutral-200">
                  Документов: {{ source.documentsImported }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
