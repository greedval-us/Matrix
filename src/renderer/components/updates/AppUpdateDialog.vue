<script setup>
import { computed } from 'vue';
import { Check, Download, RefreshCw, X } from 'lucide-vue-next';
import AppDialog from '../ui/AppDialog.vue';
import { useAppUpdates } from '../../composables/useAppUpdates.js';

const emit = defineEmits(['close']);
const { state, pendingAction, error, message, busy, statusMessage, check, download, cancel, install, saveCopy } = useAppUpdates();
const release = computed(() => state.value.release);
const downloading = computed(() => state.value.status === 'downloading');
const ready = computed(() => state.value.status === 'ready');
const installing = computed(() => state.value.status === 'installing' || pendingAction.value === 'install');
const sizeLabel = computed(() => {
  const bytes = Number(release.value?.size);
  if (!(bytes > 0)) return '';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(bytes / 1048576)} МБ`;
});
</script>

<template>
  <AppDialog title="Обновление приложения" :busy="installing" class="update-dialog" @close="emit('close')">
    <div class="space-y-5">
      <div v-if="release" class="update-version">
        <span class="update-version-icon"><Check v-if="ready" aria-hidden="true" class="h-5 w-5" /><Download v-else aria-hidden="true" class="h-5 w-5" /></span>
        <div class="min-w-0">
          <p class="break-words text-base font-semibold text-matrix-text">Версия {{ release.version }}</p>
          <p class="mt-1 text-xs text-matrix-muted">
            <span v-if="state.currentVersion">Установлена {{ state.currentVersion }}</span><span v-if="sizeLabel"> · {{ sizeLabel }}</span>
          </p>
        </div>
      </div>
      <div v-if="release?.notes" class="update-notes">
        <h3 class="mb-2 text-sm font-medium text-matrix-secondary">Что нового</h3>
        <p class="whitespace-pre-wrap break-words text-sm leading-6 text-matrix-muted">{{ release.notes }}</p>
      </div>
      <div>
        <p role="status" class="text-sm text-matrix-secondary">{{ statusMessage }}</p>
        <progress v-if="downloading" class="update-progress mt-3" :value="state.progress" max="100" aria-label="Загрузка обновления" />
        <p v-if="downloading" class="mt-2 text-xs leading-5 text-matrix-muted">Можно закрыть это окно — загрузка продолжится.</p>
      </div>
      <p v-if="state.canInstall" class="text-sm leading-6 text-matrix-muted">
        Перед установкой завершите текущую работу. После нажатия «Обновить и перезапустить» приложение закроется и запустится в новой версии.
      </p>
      <p v-else class="text-sm leading-6 text-matrix-muted">
        Сохраните файл новой версии. Завершите текущую работу, закройте приложение и запустите скачанный файл вручную.
      </p>
      <p v-if="error" role="alert" class="mx-alert text-sm">{{ error }}</p>
      <p v-if="message" role="status" class="mx-alert mx-success text-sm">{{ message }}</p>
      <div class="update-actions border-t border-matrix-border pt-4">
        <button v-if="downloading" type="button" class="mx-button" :disabled="pendingAction === 'cancel'" @click="cancel">
          <X aria-hidden="true" class="h-4 w-4" />{{ pendingAction === 'cancel' ? 'Отмена…' : 'Отменить загрузку' }}
        </button>
        <template v-else>
          <button v-if="state.status === 'error' && release" type="button" class="mx-button" :disabled="busy" @click="check">
            <RefreshCw aria-hidden="true" class="h-4 w-4" />Проверить снова
          </button>
          <button v-if="state.canInstall && !ready" type="button" class="mx-button mx-button-primary" :disabled="busy" @click="download">
            <Download aria-hidden="true" class="h-4 w-4" />{{ pendingAction === 'download' ? 'Подготовка…' : 'Загрузить обновление' }}
          </button>
          <button v-if="ready && state.canInstall" type="button" class="mx-button mx-button-primary" :disabled="busy" @click="install">
            <RefreshCw aria-hidden="true" class="h-4 w-4" />Обновить и перезапустить
          </button>
          <button type="button" class="mx-button" :class="{ 'mx-button-primary': !state.canInstall }" :disabled="busy" @click="saveCopy">
            <Download aria-hidden="true" class="h-4 w-4" />{{ pendingAction === 'saveCopy' ? 'Сохраняем файл…' : 'Скачать файл' }}
          </button>
        </template>
      </div>
    </div>
  </AppDialog>
</template>

<style scoped>
.update-dialog { max-width: 520px; }
.update-version { display: flex; align-items: center; gap: 12px; }
.update-version-icon { display: grid; width: 44px; height: 44px; flex-shrink: 0; place-items: center; border: 1px solid rgb(var(--mx-accent-rgb) / .2); border-radius: 13px; background: rgb(var(--mx-accent-rgb) / .08); color: rgb(var(--mx-accent-rgb)); }
.update-notes { max-height: 220px; overflow-y: auto; padding: 14px; border: 1px solid rgb(var(--mx-border-rgb)); border-radius: 10px; }
.update-progress { display: block; width: 100%; height: 7px; overflow: hidden; border: 0; border-radius: 999px; background: rgb(var(--mx-raised-rgb)); accent-color: rgb(var(--mx-accent-rgb)); }
.update-progress::-webkit-progress-bar { background: rgb(var(--mx-raised-rgb)); }
.update-progress::-webkit-progress-value { border-radius: 999px; background: rgb(var(--mx-accent-rgb)); transition: width 150ms ease; }
.update-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 440px) { .update-actions .mx-button { width: 100%; } }
@media (prefers-reduced-motion: reduce) { .update-progress::-webkit-progress-value { transition: none; } }
</style>
