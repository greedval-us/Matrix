<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const sourceFolderPath = ref("");
const databaseRootPath = ref("");
const databaseStatus = ref(null);
const importStatus = ref(null);
const indexStatus = ref(null);
const importProgress = ref(null);
const indexProgress = ref(null);
const error = ref("");
const isImporting = ref(false);
const isIndexing = ref(false);

let indexPollingTimer = null;
let removeImportProgressListener = null;
let removeIndexProgressListener = null;

const canImport = computed(
  () =>
    Boolean(sourceFolderPath.value) &&
    Boolean(databaseStatus.value?.initialized) &&
    !isImporting.value &&
    !isIndexing.value
);

const canBuildIndex = computed(
  () =>
    Boolean(databaseStatus.value?.initialized) &&
    !isImporting.value &&
    !isIndexing.value
);

const importTotals = computed(() => ({
  filesProcessed:
    importProgress.value?.filesProcessed ?? importStatus.value?.filesProcessed ?? 0,
  filesTotal:
    importProgress.value?.filesTotal ??
    importStatus.value?.filesTotal ??
    importStatus.value?.sources?.length ??
    0,
  documentsImported:
    importProgress.value?.documentsImported ?? importStatus.value?.documentsImported ?? 0,
  documentsTotal:
    importProgress.value?.recordsTotal ??
    importStatus.value?.documentsTotal ??
    importStatus.value?.documentsImported ??
    0,
  fileDocumentsImported: importProgress.value?.fileDocumentsImported ?? 0,
  fileDocumentsTotal: importProgress.value?.fileRecordsTotal ?? 0,
}));

const indexTotals = computed(() => ({
  filesProcessed:
    indexProgress.value?.filesProcessed ?? indexStatus.value?.filesProcessed ?? 0,
  filesTotal:
    indexProgress.value?.filesTotal ?? indexStatus.value?.filesTotal ?? 0,
  indexedDocuments:
    indexProgress.value?.indexedDocuments ?? indexStatus.value?.indexedDocuments ?? 0,
  documentsTotal:
    indexProgress.value?.documentsTotal ??
    indexStatus.value?.documentsTotal ??
    indexStatus.value?.indexedDocuments ??
    0,
  indexedEntries:
    indexProgress.value?.indexedEntries ?? indexStatus.value?.indexedEntries ?? 0,
  fileDocumentsProcessed: indexProgress.value?.fileDocumentsProcessed ?? 0,
  fileDocumentsTotal: indexProgress.value?.fileDocumentsTotal ?? 0,
}));

const importProgressPercent = computed(() => {
  const { documentsImported, documentsTotal, filesProcessed, filesTotal } =
    importTotals.value;

  if (documentsTotal > 0) {
    return Math.min(100, Math.round((documentsImported / documentsTotal) * 100));
  }

  if (filesTotal > 0) {
    return Math.min(100, Math.round((filesProcessed / filesTotal) * 100));
  }

  return 0;
});

const indexProgressPercent = computed(() => {
  const { indexedDocuments, documentsTotal, filesProcessed, filesTotal } =
    indexTotals.value;

  if (documentsTotal > 0) {
    return Math.min(100, Math.round((indexedDocuments / documentsTotal) * 100));
  }

  if (filesTotal > 0) {
    return Math.min(100, Math.round((filesProcessed / filesTotal) * 100));
  }

  return 0;
});

const databaseStatusText = computed(() => {
  if (!databaseStatus.value) return "Статус локальной базы еще не загружен";
  if (databaseStatus.value.initialized) return "Локальная база готова к импорту и индексации";
  if (databaseStatus.value.rootPath) return "Локальная база еще не создана";
  return "Сначала выберите каталог базы в настройках";
});

const importStatusText = computed(() => {
  if (importProgress.value?.stage === "started") return "Импорт запущен";
  if (importProgress.value?.stage === "progress") return "Импорт выполняется";
  if (importProgress.value?.stage === "file-completed") return "Файл импортирован";
  if (importProgress.value?.stage === "completed") return "Импорт завершен";
  if (importProgress.value?.stage === "failed") return "Импорт завершился с ошибкой";

  if (!importStatus.value) return "Импорт еще не запускался";
  if (importStatus.value.status === "running") return "Импорт выполняется";
  if (importStatus.value.status === "failed") return "Импорт завершился с ошибкой";
  if (importStatus.value.status === "completed") return "Импорт завершен";
  return "Статус импорта неизвестен";
});

const indexStatusText = computed(() => {
  if (indexProgress.value?.stage === "started") return "Индексация запущена";
  if (indexProgress.value?.stage === "progress") return "Индексация выполняется";
  if (indexProgress.value?.stage === "file-completed") return "Файл проиндексирован";
  if (indexProgress.value?.stage === "completed") return "Индексация завершена";
  if (indexProgress.value?.stage === "failed") return "Индексация завершилась с ошибкой";

  if (!indexStatus.value) return "Индексация еще не запускалась";
  if (indexStatus.value.status === "running") return "Индексация выполняется";
  if (indexStatus.value.status === "failed") return "Индексация завершилась с ошибкой";
  if (indexStatus.value.status === "completed") return "Индексация завершена";
  return "Статус индексации неизвестен";
});

async function loadState() {
  databaseRootPath.value = await window.databaseStorageAPI.getRootPath();
  databaseStatus.value = await window.databaseStorageAPI.getStatus(databaseRootPath.value);
  importStatus.value = await window.importAPI.getLastStatus();
  indexStatus.value = await window.indexAPI.getLastStatus();

  if (indexStatus.value?.status === "running") {
    isIndexing.value = true;
    startIndexPolling();
  }
}

async function refreshIndexStatus() {
  indexStatus.value = await window.indexAPI.getLastStatus();

  if (!indexStatus.value || indexStatus.value.status !== "running") {
    isIndexing.value = false;
    stopIndexPolling();
  }
}

function startIndexPolling() {
  if (indexPollingTimer) return;

  indexPollingTimer = window.setInterval(() => {
    refreshIndexStatus().catch((e) => {
      error.value = e.message || "Ошибка обновления статуса индексации";
      stopIndexPolling();
    });
  }, 1000);
}

function stopIndexPolling() {
  if (!indexPollingTimer) return;

  window.clearInterval(indexPollingTimer);
  indexPollingTimer = null;
}

async function chooseImportFolder() {
  try {
    const selectedPath = await window.fileDialog.openFolder();
    if (!selectedPath) return;
    sourceFolderPath.value = selectedPath;
    error.value = "";
  } catch (e) {
    error.value = "Не удалось выбрать папку импорта";
    console.error(e);
  }
}

async function runImport() {
  if (!canImport.value) return;

  isImporting.value = true;
  importProgress.value = null;
  error.value = "";

  try {
    importStatus.value = await window.importAPI.runFolder(sourceFolderPath.value);
    indexStatus.value = await window.indexAPI.getLastStatus();
  } catch (e) {
    error.value = e.message || "Ошибка импорта";
    console.error(e);
  } finally {
    isImporting.value = false;
  }
}

async function buildIndex() {
  if (!canBuildIndex.value) return;

  isIndexing.value = true;
  indexProgress.value = null;
  error.value = "";

  try {
    startIndexPolling();
    indexStatus.value = await window.indexAPI.build();
  } catch (e) {
    error.value = e.message || "Ошибка индексации";
    console.error(e);
  } finally {
    await refreshIndexStatus();
  }
}

onMounted(async () => {
  await loadState();

  if (window.importAPI?.onProgress) {
    removeImportProgressListener = window.importAPI.onProgress((payload) => {
      importProgress.value = payload;
    });
  }

  if (window.indexAPI?.onProgress) {
    removeIndexProgressListener = window.indexAPI.onProgress((payload) => {
      indexProgress.value = payload;
    });
  }
});

onBeforeUnmount(() => {
  stopIndexPolling();
  removeImportProgressListener?.();
  removeIndexProgressListener?.();
});
</script>

<template>
  <div class="h-full overflow-y-auto bg-gradient-to-br from-neutral-900 to-neutral-950 p-6 text-white">
    <div class="mx-auto max-w-6xl space-y-6">
      <div class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-2xl backdrop-blur-xl">
        <h1 class="text-3xl font-bold">Импорт и индексация</h1>
        <p class="mt-2 text-sm text-neutral-400">
          Сначала импортируйте JSON-файлы в локальную базу, затем отдельным шагом постройте индексы для поиска по полям.
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
              {{ isImporting ? "Импорт..." : "Запустить импорт" }}
            </button>
            <button
              @click="loadState"
              class="rounded-2xl bg-neutral-800 px-5 py-3 font-semibold transition hover:bg-neutral-700"
            >
              Обновить
            </button>
          </div>

          <div class="space-y-3 rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
              <div class="text-neutral-300">{{ importStatusText }}</div>
              <div class="text-neutral-400">{{ importProgressPercent }}%</div>
            </div>

            <div class="h-3 overflow-hidden rounded-full bg-neutral-700">
              <div
                class="h-full rounded-full bg-emerald-500 transition-all duration-300"
                :style="{ width: `${importProgressPercent}%` }"
              />
            </div>

            <div class="grid gap-3 text-sm text-neutral-300 md:grid-cols-2">
              <div>
                Файлы: {{ importTotals.filesProcessed }} / {{ importTotals.filesTotal }}
              </div>
              <div>
                Документы: {{ importTotals.documentsImported }} / {{ importTotals.documentsTotal }}
              </div>
            </div>

            <div v-if="importProgress?.fileName" class="space-y-1 text-sm text-neutral-400">
              <div class="break-all">Текущий файл: {{ importProgress.fileName }}</div>
              <div>
                Внутри файла: {{ importTotals.fileDocumentsImported }} / {{ importTotals.fileDocumentsTotal }}
              </div>
            </div>
          </div>
        </section>

        <section class="space-y-5 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 shadow-xl backdrop-blur-xl">
          <div>
            <h2 class="text-xl font-semibold">Локальная база</h2>
            <p class="mt-1 text-sm text-neutral-400">{{ databaseStatusText }}</p>
          </div>

          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4 text-sm">
            <div class="text-neutral-400">Путь базы</div>
            <div class="mt-1 break-all text-white">{{ databaseRootPath || "Не выбран" }}</div>
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
            {{ isIndexing ? "Индексация..." : "Построить индекс" }}
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

          <div class="grid gap-3 text-sm text-neutral-300 md:grid-cols-2">
            <div>
              Файлы: {{ indexTotals.filesProcessed }} / {{ indexTotals.filesTotal }}
            </div>
            <div>
              Документы: {{ indexTotals.indexedDocuments }} / {{ indexTotals.documentsTotal }}
            </div>
          </div>

          <div v-if="indexStatus?.currentFile || indexProgress?.currentFile" class="space-y-1 text-sm text-neutral-400">
            <div class="break-all">Текущий файл: {{ indexProgress?.currentFile || indexStatus?.currentFile }}</div>
            <div>
              Внутри файла: {{ indexTotals.fileDocumentsProcessed }} / {{ indexTotals.fileDocumentsTotal }}
            </div>
          </div>

          <div v-if="indexStatus?.error" class="break-all text-sm text-red-300">
            {{ indexStatus.error }}
          </div>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Файлы</div>
            <div class="mt-2 text-sm text-white">
              {{ indexTotals.filesProcessed }} / {{ indexTotals.filesTotal }}
            </div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Документы</div>
            <div class="mt-2 text-sm text-white">
              {{ indexTotals.indexedDocuments }}
            </div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Индекс-записи</div>
            <div class="mt-2 text-sm text-white">
              {{ indexTotals.indexedEntries }}
            </div>
          </div>
          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Дата</div>
            <div class="mt-2 break-all text-sm text-white">{{ indexStatus?.indexedAt || "-" }}</div>
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
              <div class="mt-2 text-sm text-white">{{ importStatus.importId || "-" }}</div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Файлы</div>
              <div class="mt-2 text-sm text-white">
                {{ importStatus.filesProcessed ?? 0 }} / {{ importStatus.filesTotal ?? 0 }}
              </div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Документы</div>
              <div class="mt-2 text-sm text-white">
                {{ importStatus.documentsImported ?? 0 }} / {{ importStatus.documentsTotal ?? 0 }}
              </div>
            </div>
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
              <div class="text-xs uppercase tracking-wide text-neutral-400">Дата</div>
              <div class="mt-2 break-all text-sm text-white">{{ importStatus.importedAt || "-" }}</div>
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
            <div class="text-xs uppercase tracking-wide text-neutral-400">Выходной файл</div>
            <div class="mt-2 break-all text-sm text-white">{{ importStatus.outputPath || "-" }}</div>
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
