<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const PAGE_SECTIONS = {
  import: "import",
  index: "index",
};

const activeSection = ref(PAGE_SECTIONS.import);
const sourceFolderPath = ref("");
const databaseRootPath = ref("");
const databaseStatus = ref(null);
const importStatus = ref(null);
const indexStatus = ref(null);
const importProgress = ref(null);
const indexProgress = ref(null);
const importedSourcesCount = ref(0);
const defaultImportName = ref("");
const defaultImportDescription = ref("");
const defaultImportType = ref("");
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
  () => Boolean(databaseStatus.value?.initialized) && !isImporting.value && !isIndexing.value
);

const canCancelIndex = computed(() => isIndexing.value || indexStatus.value?.status === "running");

const importTotals = computed(() => ({
  filesProcessed: importProgress.value?.filesProcessed ?? importStatus.value?.filesProcessed ?? 0,
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
  filesProcessed: indexProgress.value?.filesProcessed ?? indexStatus.value?.filesProcessed ?? 0,
  filesTotal: indexProgress.value?.filesTotal ?? indexStatus.value?.filesTotal ?? 0,
  indexedDocuments:
    indexProgress.value?.indexedDocuments ?? indexStatus.value?.indexedDocuments ?? 0,
  documentsTotal:
    indexProgress.value?.documentsTotal ??
    indexStatus.value?.documentsTotal ??
    indexStatus.value?.indexedDocuments ??
    0,
  indexedEntries: indexProgress.value?.indexedEntries ?? indexStatus.value?.indexedEntries ?? 0,
  fileDocumentsProcessed: indexProgress.value?.fileDocumentsProcessed ?? 0,
  fileDocumentsTotal: indexProgress.value?.fileDocumentsTotal ?? 0,
}));

const importProgressPercent = computed(() => {
  const { documentsImported, documentsTotal, filesProcessed, filesTotal } = importTotals.value;
  if (documentsTotal > 0) return Math.min(100, Math.round((documentsImported / documentsTotal) * 100));
  if (filesTotal > 0) return Math.min(100, Math.round((filesProcessed / filesTotal) * 100));
  return 0;
});

const indexProgressPercent = computed(() => {
  const { indexedDocuments, documentsTotal, filesProcessed, filesTotal } = indexTotals.value;
  if (documentsTotal > 0) return Math.min(100, Math.round((indexedDocuments / documentsTotal) * 100));
  if (filesTotal > 0) return Math.min(100, Math.round((filesProcessed / filesTotal) * 100));
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
  if (indexProgress.value?.stage === "cancelled") return "Индексация остановлена";
  if (indexProgress.value?.stage === "completed") return "Индексация завершена";
  if (indexProgress.value?.stage === "failed") return "Индексация завершилась с ошибкой";
  if (!indexStatus.value) return "Индексация еще не запускалась";
  if (indexStatus.value.status === "running") return "Индексация выполняется";
  if (indexStatus.value.status === "cancelled") return "Индексация остановлена. Можно продолжить позже";
  if (indexStatus.value.status === "failed") return "Индексация завершилась с ошибкой";
  if (indexStatus.value.status === "completed") return "Индексация завершена";
  return "Статус индексации неизвестен";
});

const indexBuildModeText = computed(() => {
  const mode = indexProgress.value?.buildMode || indexStatus.value?.buildMode || "";
  const resumed = Boolean(indexStatus.value?.resumedAt);

  if (resumed && indexStatus.value?.status === "running") {
    return "Продолжение после остановки";
  }

  if (resumed && indexStatus.value?.status === "completed") {
    return "Продолжено из сохраненного состояния";
  }

  if (mode === "incremental") return "Инкрементальная индексация";
  if (mode === "full") return "Полная перестройка";
  if (mode === "noop") return "Изменений не найдено";
  return "Режим будет определен автоматически";
});

const indexBuildReasonText = computed(() => {
  const reason = indexProgress.value?.buildReason || indexStatus.value?.buildReason || "";
  const resumed = Boolean(indexStatus.value?.resumedAt);

  if (resumed && indexStatus.value?.status === "running") {
    return "Продолжение ранее остановленной или прерванной индексации";
  }

  if (resumed && indexStatus.value?.status === "completed") {
    return "Индексация была успешно продолжена из сохраненного checkpoint";
  }

  switch (reason) {
    case "initial-build":
      return "Индексы создаются впервые или предыдущий индекс отсутствовал";
    case "new-document-files":
      return "Найдены новые файлы документов, поэтому обработаны только они";
    case "source-files-changed":
      return "Обнаружены измененные или удаленные файлы, поэтому выполнена полная перестройка";
    case "no-document-changes":
      return "Изменений в документах не найдено, перестройка не потребовалась";
    default:
      return "Причина режима будет показана после анализа документов";
  }
});

const importStatusBadge = computed(() => {
  if (importProgress.value?.stage === "progress" || importStatus.value?.status === "running") {
    return `${importProgressPercent.value}%`;
  }
  if (importProgress.value?.stage === "completed" || importStatus.value?.status === "completed") {
    return "Завершен";
  }
  if (importProgress.value?.stage === "failed" || importStatus.value?.status === "failed") {
    return "Ошибка";
  }
  return "Не запускался";
});

const indexStatusBadge = computed(() => {
  if (indexProgress.value?.stage === "progress" || indexStatus.value?.status === "running") {
    return `${indexProgressPercent.value}%`;
  }
  if (indexProgress.value?.stage === "cancelled" || indexStatus.value?.status === "cancelled") {
    return "Пауза";
  }
  if (indexProgress.value?.stage === "completed" || indexStatus.value?.status === "completed") {
    return "Готово";
  }
  if (indexProgress.value?.stage === "failed" || indexStatus.value?.status === "failed") {
    return "Ошибка";
  }
  return "Не запускалась";
});

const buildIndexButtonText = computed(() => {
  if (isIndexing.value) return "Индексация...";
  if (indexStatus.value?.status === "cancelled") return "Продолжить индексацию";
  return "Построить индекс";
});

const currentSectionTitle = computed(() =>
  activeSection.value === PAGE_SECTIONS.import ? "Импорт" : "Индексация"
);

const currentSectionDescription = computed(() =>
  activeSection.value === PAGE_SECTIONS.import
    ? "Загрузка новых JSON-файлов в локальную базу с безопасным созданием источников."
    : "Построение и продолжение поисковых индексов по уже импортированным документам."
);

async function loadImportedSourcesCount() {
  try {
    const rows = await window.searchAPI.listDatabases({ request: "local-sources" });
    importedSourcesCount.value = Array.isArray(rows) ? rows.length : 0;
  } catch (e) {
    importedSourcesCount.value = 0;
    console.error(e);
  }
}

async function loadState() {
  databaseRootPath.value = await window.databaseStorageAPI.getRootPath();
  databaseStatus.value = await window.databaseStorageAPI.getStatus(databaseRootPath.value);
  importStatus.value = await window.importAPI.getLastStatus();
  indexStatus.value = await window.indexAPI.getLastStatus();
  await loadImportedSourcesCount();

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

function showSection(section) {
  activeSection.value = section;
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
    importStatus.value = await window.importAPI.runFolder(sourceFolderPath.value, {
      defaultName: defaultImportName.value,
      defaultDescription: defaultImportDescription.value,
      defaultType: defaultImportType.value,
    });
    indexStatus.value = await window.indexAPI.getLastStatus();
    await loadImportedSourcesCount();
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

async function cancelIndex() {
  if (!canCancelIndex.value) return;

  try {
    indexStatus.value = await window.indexAPI.cancel();
    await refreshIndexStatus();
  } catch (e) {
    error.value = e.message || "Не удалось остановить индексацию";
    console.error(e);
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
  <div class="h-full overflow-y-auto bg-gradient-to-br from-neutral-900 to-neutral-950 p-4 text-white sm:p-6">
    <div class="mx-auto max-w-7xl space-y-6">
      <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
        <div class="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div class="min-w-0 max-w-3xl space-y-3">
            <h1 class="break-words text-2xl font-bold text-white sm:text-3xl">Импорт локальной базы</h1>
            <p class="text-sm leading-6 text-neutral-300">
              Рабочая зона теперь разделена на два понятных сценария: сначала импорт новых документов,
              затем отдельная индексация. Так проще контролировать процесс и статус каждого шага.
            </p>
          </div>

          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-800/70 px-4 py-3 shadow-inner">
              <div class="text-xs text-neutral-400">База</div>
              <div class="mt-1 break-words text-sm font-semibold text-white">
                {{ databaseStatus?.initialized ? "Готова" : "Не готова" }}
              </div>
            </div>
            <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-800/70 px-4 py-3 shadow-inner">
              <div class="text-xs text-neutral-400">Импорт</div>
              <div class="mt-1 break-words text-sm font-semibold text-white">{{ importStatusBadge }}</div>
              <div class="mt-1 text-xs text-neutral-400">Источников: {{ importedSourcesCount }}</div>
            </div>
            <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-800/70 px-4 py-3 shadow-inner sm:col-span-2 xl:col-span-1">
              <div class="text-xs text-neutral-400">Индексация</div>
              <div class="mt-1 break-words text-sm font-semibold text-white">{{ indexStatusBadge }}</div>
              <div class="mt-1 text-xs text-neutral-400">{{ indexBuildModeText }}</div>
            </div>
          </div>
        </div>
      </section>

      <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-3 shadow-2xl backdrop-blur-xl sm:p-4">
        <div class="grid gap-3 md:grid-cols-2">
          <button
            @click="showSection(PAGE_SECTIONS.import)"
            class="rounded-2xl border px-4 py-4 text-left transition"
            :class="
              activeSection === PAGE_SECTIONS.import
                ? 'border-emerald-500 bg-emerald-500/10 shadow-lg'
                : 'border-neutral-700 bg-neutral-800/70 hover:bg-neutral-800'
            "
          >
            <div class="text-sm font-semibold text-white">Импорт</div>
            <div class="mt-1 text-xs leading-5 text-neutral-400">
              Добавление новых баз и файлов в `documents/`
            </div>
          </button>

          <button
            @click="showSection(PAGE_SECTIONS.index)"
            class="rounded-2xl border px-4 py-4 text-left transition"
            :class="
              activeSection === PAGE_SECTIONS.index
                ? 'border-neutral-300 bg-neutral-200/10 shadow-lg'
                : 'border-neutral-700 bg-neutral-800/70 hover:bg-neutral-800'
            "
          >
            <div class="text-sm font-semibold text-white">Индексация</div>
            <div class="mt-1 text-xs leading-5 text-neutral-400">
              Построение и продолжение поисковых индексов в `indexes/`
            </div>
          </button>
        </div>
      </section>

      <div class="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
          <div class="flex flex-col gap-3 border-b border-neutral-700 pb-5">
            <div class="min-w-0">
              <h2 class="break-words text-xl font-semibold text-white sm:text-2xl">{{ currentSectionTitle }}</h2>
              <p class="mt-1 text-sm text-neutral-400">{{ currentSectionDescription }}</p>
            </div>
          </div>

          <div v-if="activeSection === PAGE_SECTIONS.import" class="mt-6 space-y-5">
            <div class="rounded-2xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-xs leading-5 text-emerald-200">
              Безопасный режим: существующие источники не перезаписываются, а новые добавляются как отдельные.
            </div>

            <div class="space-y-2">
              <label for="source-folder" class="text-sm font-medium text-neutral-300">Папка с файлами</label>
              <input
                id="source-folder"
                v-model="sourceFolderPath"
                placeholder="E:\\Imports"
                class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 shadow-inner transition hover:bg-neutral-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400"
              >
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <div class="min-w-0 space-y-2">
                <label for="import-name" class="text-sm font-medium text-neutral-300">Имя новых баз</label>
                <input
                  id="import-name"
                  v-model="defaultImportName"
                  placeholder="Например: Архив клиентов"
                  class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 shadow-inner transition hover:bg-neutral-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                <p class="text-xs text-neutral-400">
                  Если импортируется один файл, имя будет использовано как есть.
                </p>
              </div>

              <div class="min-w-0 space-y-2">
                <label for="import-type" class="text-sm font-medium text-neutral-300">Тип новых баз</label>
                <input
                  id="import-type"
                  v-model="defaultImportType"
                  placeholder="Контакты, финансы, услуги"
                  class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 shadow-inner transition hover:bg-neutral-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400"
                >
                <p class="text-xs text-neutral-400">
                  Если оставить пустым, будет использован тип `local-import`.
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <label for="import-description" class="text-sm font-medium text-neutral-300">
                Описание новых баз
              </label>
              <textarea
                id="import-description"
                v-model="defaultImportDescription"
                rows="3"
                placeholder="Если поле пустое, описание будет создано автоматически по имени файла"
                class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 shadow-inner transition hover:bg-neutral-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400"
              />
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button
                @click="chooseImportFolder"
                class="rounded-2xl bg-neutral-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-neutral-600 hover:shadow-lg"
              >
                Выбрать папку
              </button>
              <button
                @click="runImport"
                :disabled="!canImport"
                class="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-600 hover:shadow-lg disabled:bg-emerald-900/60"
              >
                {{ isImporting ? "Импорт..." : "Запустить импорт" }}
              </button>
              <button
                @click="loadState"
                class="rounded-2xl bg-neutral-800 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-neutral-700 hover:shadow-lg sm:col-span-2 xl:col-span-1"
              >
                Обновить
              </button>
            </div>

            <div class="rounded-3xl border border-neutral-700 bg-neutral-800/60 p-4 sm:p-5">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0 break-words text-sm text-neutral-300">{{ importStatusText }}</div>
                <div class="text-sm font-semibold text-white">{{ importProgressPercent }}%</div>
              </div>

              <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-700">
                <div
                  class="h-full rounded-full bg-emerald-500 transition-all duration-300"
                  :style="{ width: `${importProgressPercent}%` }"
                />
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Файлы</div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    {{ importTotals.filesProcessed }} / {{ importTotals.filesTotal }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Документы</div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    {{ importTotals.documentsImported }} / {{ importTotals.documentsTotal }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Текущий файл</div>
                  <div class="mt-1 break-all text-sm font-semibold text-white">
                    {{ importProgress?.fileName || "-" }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Внутри файла</div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    {{ importTotals.fileDocumentsImported }} / {{ importTotals.fileDocumentsTotal }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="mt-6 space-y-5">
            <div class="rounded-2xl border border-neutral-700 bg-neutral-800/60 px-4 py-3 text-sm text-neutral-300">
              Индексы строятся по документам из `documents/` и сохраняются в `indexes/`. Если процесс
              уже был остановлен, можно продолжить с сохраненного состояния.
            </div>

            <div class="flex flex-wrap gap-3">
              <button
                @click="buildIndex"
                :disabled="!canBuildIndex"
                class="rounded-2xl bg-neutral-700 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-neutral-600 hover:shadow-lg disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                {{ buildIndexButtonText }}
              </button>
              <button
                v-if="canCancelIndex"
                @click="cancelIndex"
                class="rounded-2xl border border-amber-700 bg-amber-950/40 px-5 py-3 text-sm font-semibold text-amber-200 shadow-md transition hover:bg-amber-900/50 hover:shadow-lg"
              >
                Остановить
              </button>
              <button
                @click="loadState"
                class="rounded-2xl bg-neutral-800 px-5 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-neutral-700 hover:shadow-lg"
              >
                Обновить
              </button>
            </div>

            <div class="rounded-3xl border border-neutral-700 bg-neutral-800/60 p-4 sm:p-5">
              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div class="min-w-0 break-words text-sm text-neutral-300">{{ indexStatusText }}</div>
                <div class="text-sm font-semibold text-white">{{ indexProgressPercent }}%</div>
              </div>

              <div class="mt-2 rounded-2xl border border-neutral-700 bg-neutral-800/70 px-4 py-3 text-sm text-neutral-300">
                <div class="font-medium text-white">{{ indexBuildModeText }}</div>
                <div class="mt-1 text-xs leading-5 text-neutral-400">{{ indexBuildReasonText }}</div>
              </div>

              <div class="mt-3 h-2.5 overflow-hidden rounded-full bg-neutral-700">
                <div
                  class="h-full rounded-full bg-neutral-300 transition-all duration-300"
                  :style="{ width: `${indexProgressPercent}%` }"
                />
              </div>

              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Файлы</div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    {{ indexTotals.filesProcessed }} / {{ indexTotals.filesTotal }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Документы</div>
                  <div class="mt-1 text-sm font-semibold text-white">
                    {{ indexTotals.indexedDocuments }} / {{ indexTotals.documentsTotal }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Текущий файл</div>
                  <div class="mt-1 break-all text-sm font-semibold text-white">
                    {{ indexProgress?.currentFile || indexStatus?.currentFile || "-" }}
                  </div>
                </div>
                <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                  <div class="text-xs text-neutral-400">Индекс-записи</div>
                  <div class="mt-1 text-sm font-semibold text-white">{{ indexTotals.indexedEntries }}</div>
                </div>
              </div>

              <div class="mt-3 rounded-2xl border border-neutral-700 bg-neutral-900/70 p-4">
                <div class="text-xs text-neutral-400">Внутри файла</div>
                <div class="mt-1 text-sm font-semibold text-white">
                  {{ indexTotals.fileDocumentsProcessed }} / {{ indexTotals.fileDocumentsTotal }}
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="error"
            class="mt-5 rounded-2xl border border-red-500 bg-red-900/30 px-4 py-3 text-sm text-red-300"
          >
            {{ error }}
          </div>
        </section>

        <div class="space-y-6">
          <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
            <h2 class="break-words text-xl font-semibold text-white sm:text-2xl">Локальная база</h2>
            <p class="mt-2 text-sm leading-6 text-neutral-400">
              Импорт и индексация работают только с инициализированной локальной базой. Если путь не
              задан или база еще не создана, сначала завершите настройку во вкладке настроек.
            </p>

            <div class="mt-5 space-y-3">
              <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4 shadow-inner">
                <div class="text-xs text-neutral-400">Статус</div>
                <div class="mt-1 break-words text-sm font-semibold text-white">{{ databaseStatusText }}</div>
              </div>
              <div class="min-w-0 rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4 shadow-inner">
                <div class="text-xs text-neutral-400">Путь базы</div>
                <div class="mt-1 break-all text-sm text-white">{{ databaseRootPath || "Не выбран" }}</div>
              </div>
              <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4 text-sm leading-6 text-neutral-300 shadow-inner">
                Если имя таблицы уже существует, импорт создаст новый уникальный источник и сохранит
                старые данные без изменений.
              </div>
            </div>
          </section>

          <section class="rounded-3xl border border-neutral-700 bg-neutral-900/80 p-5 shadow-2xl backdrop-blur-xl sm:p-8">
            <h2 class="break-words text-xl font-semibold text-white sm:text-2xl">Что сейчас делать</h2>
            <div class="mt-4 space-y-3 text-sm leading-6 text-neutral-300">
              <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
                <div class="font-semibold text-white">1. Импорт</div>
                <div class="mt-1">Выберите папку с файлами, при необходимости заполните имя, тип и описание.</div>
              </div>
              <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
                <div class="font-semibold text-white">2. Индексация</div>
                <div class="mt-1">После завершения импорта перейдите в соседний блок и постройте индекс.</div>
              </div>
              <div class="rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
                <div class="font-semibold text-white">3. Продолжение</div>
                <div class="mt-1">Если индексация была остановлена, здесь же можно безопасно продолжить ее позже.</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</template>
