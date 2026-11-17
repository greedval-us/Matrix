<script setup>
import { computed } from 'vue';
import { Download, LoaderCircle, Check } from 'lucide-vue-next';
import { useAppUpdates } from '../../composables/useAppUpdates.js';
import { finishDialogLeave } from '../ui/AppDialog.vue';
import AppUpdateDialog from './AppUpdateDialog.vue';

const { state, hasUpdate, dialogOpen, openDialog, closeDialog } = useAppUpdates();
const label = computed(() => state.value.status === 'downloading'
  ? `Загрузка обновления: ${Math.round(state.value.progress)}%`
  : state.value.status === 'ready'
    ? `Обновление ${state.value.release?.version} готово`
    : `Доступно обновление ${state.value.release?.version}`);
</script>

<template>
  <button v-if="hasUpdate" type="button" class="mx-icon-button update-indicator"
    :aria-label="label" :title="label" aria-haspopup="dialog" @click="openDialog">
    <LoaderCircle v-if="state.status === 'downloading' || state.status === 'installing'" aria-hidden="true" class="h-[18px] w-[18px] animate-spin" />
    <Check v-else-if="state.status === 'ready'" aria-hidden="true" class="h-[18px] w-[18px]" />
    <Download v-else aria-hidden="true" class="h-[18px] w-[18px]" />
    <span class="update-badge" aria-hidden="true" />
  </button>
  <Transition name="dialog" @after-leave="finishDialogLeave">
    <AppUpdateDialog v-if="dialogOpen" @close="closeDialog" />
  </Transition>
</template>

<style scoped>
.update-indicator { position: relative; color: rgb(var(--mx-accent-rgb)); }
.update-badge { position: absolute; top: 3px; right: 3px; width: 7px; height: 7px; border-radius: 50%; background: rgb(var(--mx-accent-rgb)); box-shadow: 0 0 0 2px var(--mx-background); }
</style>
