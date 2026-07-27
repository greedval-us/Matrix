<script setup>
import { computed, onMounted, ref } from "vue";
import { InstructionSteps } from "../../shared/constants/InstructionData";
import InstructionSection from "../components/ui/Section.vue";
import { processAndGroupMeta } from "../utils/helpers/DatabaseMetaHelper";

const activeStep = ref(0);
const yearlyUpdates = ref({});
const updatesLoading = ref(false);
const updatesError = ref("");
const importStatus = ref(null);
const indexStatus = ref(null);
const operationsLoading = ref(false);
const operationsError = ref("");

onMounted(async () => {
  await Promise.all([loadUpdates(), loadOperations()]);
});

async function loadUpdates() {
  updatesLoading.value = true;
  updatesError.value = "";

  try {
    const rows = await window.searchAPI.listDatabases({ request: "local-updates" });
    yearlyUpdates.value = processAndGroupMeta(rows);
  } catch (error) {
    updatesError.value = error?.message || "Не удалось загрузить обновления баз";
    yearlyUpdates.value = {};
  } finally {
    updatesLoading.value = false;
  }
}

async function loadOperations() {
  operationsLoading.value = true;
  operationsError.value = "";

  try {
    const [lastImportStatus, lastIndexStatus] = await Promise.all([
      window.importAPI.getLastStatus(),
      window.indexAPI.getLastStatus(),
    ]);

    importStatus.value = lastImportStatus;
    indexStatus.value = lastIndexStatus;
  } catch (error) {
    operationsError.value = error?.message || "Не удалось загрузить последние операции";
    importStatus.value = null;
    indexStatus.value = null;
  } finally {
    operationsLoading.value = false;
  }
}

function formatDate(value) {
  if (!value) return "Нет данных";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function mapImportStatusLabel(status) {
  switch (status) {
    case "running":
      return "Выполняется";
    case "completed":
      return "Завершен";
    case "failed":
      return "Ошибка";
    default:
      return "Нет данных";
  }
}

function mapIndexStatusLabel(status) {
  switch (status) {
    case "running":
      return "Выполняется";
    case "completed":
      return "Завершена";
    case "failed":
      return "Ошибка";
    case "cancelled":
      return "Остановлена";
    default:
      return "Нет данных";
  }
}

function mapIndexModeLabel(mode, resumedAt) {
  if (resumedAt) return "Продолжение";
  if (mode === "incremental") return "Инкрементальная";
  if (mode === "full") return "Полная";
  if (mode === "noop") return "Без изменений";
  return "Нет данных";
}

function mapIndexReasonLabel(reason, resumedAt) {
  if (resumedAt) return "Продолжена из сохраненного состояния";

  switch (reason) {
    case "initial-build":
      return "Первое построение индексов";
    case "new-document-files":
      return "Обнаружены новые файлы";
    case "source-files-changed":
      return "Обнаружены измененные или удаленные файлы";
    case "no-document-changes":
      return "Изменений не найдено";
    default:
      return "Нет данных";
  }
}

const operationCards = computed(() => [
  {
    id: "import",
    title: "Последний импорт",
    status: mapImportStatusLabel(importStatus.value?.status),
    primaryMeta: `Начат: ${formatDate(importStatus.value?.startedAt || importStatus.value?.importedAt)}`,
    secondaryMeta: `Завершен: ${formatDate(importStatus.value?.completedAt)}`,
    stats: [
      {
        label: "Файлы",
        value: `${importStatus.value?.filesProcessed ?? 0} / ${importStatus.value?.filesTotal ?? 0}`,
      },
      {
        label: "Документы",
        value: `${importStatus.value?.documentsImported ?? 0} / ${importStatus.value?.documentsTotal ?? 0}`,
      },
    ],
  },
  {
    id: "index",
    title: "Последняя индексация",
    status: mapIndexStatusLabel(indexStatus.value?.status),
    primaryMeta: `Режим: ${mapIndexModeLabel(indexStatus.value?.buildMode, indexStatus.value?.resumedAt)}`,
    secondaryMeta: mapIndexReasonLabel(indexStatus.value?.buildReason, indexStatus.value?.resumedAt),
    footerMeta: `Завершена: ${formatDate(indexStatus.value?.completedAt || indexStatus.value?.indexedAt)}`,
    stats: [
      {
        label: "Файлы",
        value: `${indexStatus.value?.filesProcessed ?? 0} / ${indexStatus.value?.filesTotal ?? 0}`,
      },
      {
        label: "Документы",
        value: `${indexStatus.value?.indexedDocuments ?? 0} / ${indexStatus.value?.documentsTotal ?? 0}`,
      },
      {
        label: "Индекс-записи",
        value: `${indexStatus.value?.indexedEntries ?? 0}`,
      },
    ],
  },
]);

const fadeIn = {
  enterActiveClass: "transition-all duration-500 ease-out",
  enterFromClass: "opacity-0 translate-y-4 scale-[0.98]",
  enterToClass: "opacity-100 translate-y-0 scale-100",
  leaveActiveClass: "transition-all duration-300 ease-in",
  leaveFromClass: "opacity-100 translate-y-0 scale-100",
  leaveToClass: "opacity-0 translate-y-4 scale-[0.98]",
};
</script>

<template>
  <div
    class="flex h-full w-full gap-6 rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900/80 to-neutral-950/80 p-4 text-white shadow-2xl backdrop-blur-xl"
  >
    <aside
      class="flex w-64 flex-col gap-4 rounded-xl border-r border-neutral-800 bg-neutral-900/60 p-3 pr-3 shadow-inner backdrop-blur-md"
    >
      <nav class="flex flex-col gap-3">
        <button
          v-for="(step, index) in InstructionSteps"
          :key="index"
          @click="activeStep = index"
          class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-gradient-to-r hover:from-neutral-600 hover:to-neutral-500 hover:shadow-lg"
          :class="{
            'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg scale-[1.02]':
              activeStep === index,
            'text-neutral-300': activeStep !== index,
          }"
        >
          <component :is="step.icon" class="h-5 w-5" />
          <span class="truncate">{{ step.title }}</span>
        </button>
      </nav>
    </aside>

    <main
      class="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-700"
    >
      <transition v-bind="fadeIn" mode="out-in">
        <template v-if="InstructionSteps[activeStep] && activeStep !== 5">
          <div
            :key="activeStep"
            class="group rounded-3xl border border-neutral-700 bg-gradient-to-br from-neutral-800/70 to-neutral-900/70 p-6 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl"
          >
            <InstructionSection
              :title="InstructionSteps[activeStep].title"
              :text="InstructionSteps[activeStep].text"
              :italic="InstructionSteps[activeStep].italic"
            />
          </div>
        </template>

        <template v-else-if="activeStep === 5">
          <div :key="'updates'" class="space-y-8">
            <section class="rounded-3xl border border-neutral-700 bg-neutral-900/70 p-6 shadow-xl">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-2xl font-bold tracking-tight text-green-500">Последние операции</h2>
                  <p class="mt-1 text-sm text-neutral-400">
                    Импорт и индексация локальной базы без перехода в логи.
                  </p>
                </div>
                <button
                  @click="loadOperations"
                  :disabled="operationsLoading"
                  class="rounded-2xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
                >
                  {{ operationsLoading ? "Загрузка..." : "Обновить" }}
                </button>
              </div>

              <div
                v-if="operationsError"
                class="mt-4 rounded-2xl border border-red-500 bg-red-900/20 px-4 py-3 text-sm text-red-300"
              >
                {{ operationsError }}
              </div>

              <div v-else class="mt-5 grid gap-4 lg:grid-cols-2">
                <article
                  v-for="card in operationCards"
                  :key="card.id"
                  class="rounded-3xl border border-neutral-700/60 bg-gradient-to-br from-neutral-800/60 to-neutral-900/70 p-5 shadow-lg"
                >
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold text-neutral-100">{{ card.title }}</h3>
                    <span class="rounded-full bg-neutral-700 px-3 py-1 text-xs text-neutral-200">
                      {{ card.status }}
                    </span>
                  </div>

                  <div class="mt-4 space-y-2 text-sm text-neutral-300">
                    <p>{{ card.primaryMeta }}</p>
                    <p>{{ card.secondaryMeta }}</p>
                    <p v-if="card.footerMeta">{{ card.footerMeta }}</p>
                  </div>

                  <div class="mt-4 grid gap-3 sm:grid-cols-2" :class="{ 'lg:grid-cols-3': card.stats.length > 2 }">
                    <div
                      v-for="stat in card.stats"
                      :key="stat.label"
                      class="rounded-2xl border border-neutral-700 bg-neutral-900/70 p-3"
                    >
                      <div class="text-xs text-neutral-400">{{ stat.label }}</div>
                      <div class="mt-1 break-words text-sm font-semibold text-white">{{ stat.value }}</div>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section class="space-y-6">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-2xl font-bold tracking-tight text-green-500">Обновления баз данных</h2>
                  <p class="mt-1 text-sm text-neutral-400">
                    Источники, импортированные в локальную базу, сгруппированные по дате.
                  </p>
                </div>
                <button
                  @click="loadUpdates"
                  :disabled="updatesLoading"
                  class="rounded-2xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
                >
                  {{ updatesLoading ? "Загрузка..." : "Обновить" }}
                </button>
              </div>

              <div
                v-if="updatesError"
                class="rounded-2xl border border-red-500 bg-red-900/20 px-4 py-3 text-sm text-red-300"
              >
                {{ updatesError }}
              </div>

              <template v-else-if="Object.keys(yearlyUpdates).length > 0">
                <div v-for="(months, year) in yearlyUpdates" :key="year" class="mb-10">
                  <h3
                    class="mb-4 border-b border-neutral-700 pb-2 text-2xl font-semibold text-neutral-100 drop-shadow-sm"
                  >
                    {{ year }}
                  </h3>

                  <div v-for="(items, month) in months" :key="month" class="mb-8">
                    <h4 class="mb-3 flex items-center gap-2 text-lg font-medium text-neutral-300">
                      <span class="h-2 w-2 rounded-full bg-neutral-500" />
                      {{ month }}
                    </h4>

                    <div class="grid w-full gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
                      <transition-group
                        name="fade-list"
                        tag="div"
                        class="contents"
                        enter-active-class="transition-all duration-500 ease-out"
                        enter-from-class="opacity-0 translate-y-3"
                        enter-to-class="opacity-100 translate-y-0"
                      >
                        <div
                          v-for="(item, idx) in items"
                          :key="item.id || idx"
                          class="group rounded-3xl border border-neutral-700/50 bg-gradient-to-br from-neutral-800/60 to-neutral-900/70 p-5 shadow-lg transition-all duration-300 backdrop-blur-sm hover:border-green-500/50"
                        >
                          <div class="transition-transform duration-300 group-hover:scale-[1.02]">
                            <h5 class="mb-2 text-base font-semibold text-neutral-100 drop-shadow-sm">
                              {{ item.name }}
                            </h5>
                            <p class="text-sm leading-relaxed text-neutral-300">
                              Тип:
                              <span class="font-medium text-neutral-200">{{ item.type }}</span>
                              <br>
                              Добавлена:
                              <span class="font-medium text-neutral-200">{{ item.formattedDate }}</span>
                              <br>
                              Кол-во строк:
                              <span class="font-medium text-neutral-200">{{ item.count }}</span>
                            </p>
                          </div>
                        </div>
                      </transition-group>
                    </div>
                  </div>
                </div>
              </template>

              <div v-else class="text-neutral-400">
                {{ updatesLoading ? "Загрузка данных..." : "Данных об обновлениях пока нет" }}
              </div>
            </section>
          </div>
        </template>
      </transition>
    </main>
  </div>
</template>

<style scoped>
.fade-list-enter-active,
.fade-list-leave-active {
  transition: all 0.5s ease;
}

.fade-list-enter-from,
.fade-list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
