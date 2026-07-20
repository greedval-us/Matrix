<script setup>
import { computed, onMounted, ref } from "vue";

const databaseRootPath = ref("");
const status = ref(null);
const error = ref("");
const isLoading = ref(false);
const isInitializing = ref(false);

const statusText = computed(() => {
  if (!status.value) return "Статус еще не проверен";
  if (!status.value.rootPath) return "Путь к локальной базе не выбран";
  if (status.value.initialized) return "Локальная база инициализирована";
  if (status.value.exists) return "Каталог найден, база еще не инициализирована";
  return "Каталог недоступен";
});

async function refreshStatus(path = databaseRootPath.value) {
  status.value = await window.databaseStorageAPI.getStatus(path);
}

async function loadSettings() {
  isLoading.value = true;
  try {
    const storedPath = await window.databaseStorageAPI.getRootPath();
    databaseRootPath.value = storedPath || "";
    await refreshStatus(storedPath || "");
  } catch (e) {
    error.value = "Не удалось загрузить параметры локальной базы";
    console.error(e);
  } finally {
    isLoading.value = false;
  }
}

async function chooseFolder() {
  try {
    const selectedPath = await window.fileDialog.openFolder();
    if (!selectedPath) return;

    databaseRootPath.value = selectedPath;
    await window.databaseStorageAPI.setRootPath(selectedPath);
    await refreshStatus(selectedPath);
    error.value = "";
  } catch (e) {
    error.value = "Не удалось выбрать каталог";
    console.error(e);
  }
}

async function savePath() {
  if (!databaseRootPath.value) {
    error.value = "Сначала выберите каталог";
    return;
  }

  try {
    await window.databaseStorageAPI.setRootPath(databaseRootPath.value);
    await refreshStatus(databaseRootPath.value);
    error.value = "";
  } catch (e) {
    error.value = "Не удалось сохранить путь";
    console.error(e);
  }
}

async function initializeDatabase() {
  if (!databaseRootPath.value) {
    error.value = "Сначала выберите каталог для базы";
    return;
  }

  isInitializing.value = true;
  try {
    status.value = await window.databaseStorageAPI.initialize(databaseRootPath.value);
    error.value = "";
  } catch (e) {
    error.value = "Не удалось создать пустую базу";
    console.error(e);
  } finally {
    isInitializing.value = false;
  }
}

onMounted(loadSettings);
</script>

<template>
  <div class="h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950 p-6">
    <div class="w-full max-w-2xl space-y-6 rounded-3xl border border-neutral-700 bg-neutral-900/80 p-8 text-white shadow-2xl backdrop-blur-xl transition-all hover:shadow-3xl">
      <h2 class="text-center text-3xl font-bold text-white drop-shadow-md">Локальная база</h2>

      <div class="space-y-2">
        <label for="database-root" class="text-sm font-medium text-neutral-300">
          Каталог на диске для хранения базы
        </label>
        <input
          id="database-root"
          v-model="databaseRootPath"
          placeholder="E:\\MatrixData"
          class="w-full rounded-2xl border border-neutral-600 bg-neutral-800 p-4 text-white placeholder-neutral-500 shadow-inner transition-all hover:bg-neutral-700 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-neutral-400"
        >
        <p class="text-xs text-neutral-400">
          Можно выбрать корень съемного диска или отдельную папку, где будут созданы каталоги
          `documents`, `indexes`, `meta`, `state`.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <button
          @click="chooseFolder"
          class="w-full rounded-2xl bg-neutral-700 py-3 font-semibold text-white shadow-md transition hover:bg-neutral-600 hover:shadow-lg"
        >
          Выбрать папку
        </button>
        <button
          @click="savePath"
          class="w-full rounded-2xl bg-neutral-800 py-3 font-semibold text-white shadow-md transition hover:bg-neutral-700 hover:shadow-lg"
        >
          Сохранить путь
        </button>
        <button
          @click="initializeDatabase"
          :disabled="isInitializing || isLoading"
          class="w-full rounded-2xl bg-emerald-700 py-3 font-semibold text-white shadow-md transition hover:bg-emerald-600 hover:shadow-lg disabled:bg-emerald-900/60"
        >
          {{ isInitializing ? "Создание..." : "Создать пустую базу" }}
        </button>
      </div>

      <div class="space-y-2 rounded-2xl border border-neutral-700 bg-neutral-800/70 p-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm text-neutral-300">Текущий статус</span>
          <button
            @click="refreshStatus()"
            class="rounded-full bg-neutral-700 px-3 py-1 text-xs transition hover:bg-neutral-600"
          >
            Обновить
          </button>
        </div>
        <p class="text-sm text-white">{{ statusText }}</p>
        <p v-if="status?.rootPath" class="break-all text-xs text-neutral-400">
          {{ status.rootPath }}
        </p>
      </div>

      <transition name="fade">
        <div
          v-if="error"
          class="mt-2 rounded-xl border border-red-500 bg-red-900/30 px-3 py-2 text-center text-sm text-red-400"
        >
          {{ error }}
        </div>
      </transition>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
