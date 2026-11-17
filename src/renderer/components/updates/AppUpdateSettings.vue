<script setup>
import { Download, RefreshCw } from 'lucide-vue-next';
import { useAppUpdates } from '../../composables/useAppUpdates.js';

const { state, supported, loaded, hasUpdate, error, busy, statusMessage, check, openDialog } = useAppUpdates();
</script>

<template>
  <section aria-labelledby="app-updates-title" class="mx-panel mt-5 p-5 md:p-7">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 id="app-updates-title" class="text-base font-semibold text-matrix-text">Обновления приложения</h2>
      <span v-if="state.currentVersion" class="text-xs text-matrix-muted">Версия {{ state.currentVersion }}</span>
    </div>
    <p role="status" class="mt-2 text-sm leading-6 text-matrix-muted">{{ statusMessage }}</p>
    <p v-if="error" role="alert" class="mx-alert mt-3 text-sm">{{ error }}</p>
    <div class="mt-4 flex flex-wrap gap-3">
      <button type="button" class="mx-button" :disabled="!loaded || !supported || busy" @click="check">
        <RefreshCw aria-hidden="true" class="h-4 w-4" :class="{ 'animate-spin': state.status === 'checking' }" />Проверить обновления
      </button>
      <button v-if="hasUpdate" type="button" class="mx-button mx-button-primary" aria-haspopup="dialog" @click="openDialog">
        <Download aria-hidden="true" class="h-4 w-4" />Открыть обновление
      </button>
    </div>
  </section>
</template>
