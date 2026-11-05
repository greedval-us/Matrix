<script setup>
import { Trash2 } from 'lucide-vue-next';
import AppDialog from '../ui/AppDialog.vue';

const props = defineProps({
  file: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['confirm', 'close']);

function close() {
  if (!props.busy) emit('close');
}

function confirm() {
  if (!props.busy) emit('confirm');
}
</script>

<template>
  <AppDialog title="Удалить файл?" @close="close">
    <form class="remove-file-form" :aria-busy="busy" @submit.prevent="confirm">
      <p class="remove-file-description">
        Файл <strong class="remove-file-name">«{{ file.name }}»</strong> будет удалён из этой записи.
        Восстановить его через приложение не получится.
      </p>
      <p v-if="error" class="mx-alert text-sm" role="alert">{{ error }}</p>
      <div class="remove-file-actions">
        <button type="button" class="mx-button" :disabled="busy" autofocus @click="close">Отмена</button>
        <button type="submit" class="mx-button remove-file-confirm" :disabled="busy">
          <Trash2 aria-hidden="true" class="h-4 w-4" />
          {{ busy ? 'Удаляем…' : 'Удалить файл' }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.remove-file-form { display: grid; gap: 20px; }
.remove-file-description { color: rgb(var(--mx-secondary-rgb)); font-size: 14px; line-height: 1.7; }
.remove-file-name { color: rgb(var(--mx-text-rgb)); font-weight: 550; overflow-wrap: anywhere; }
.remove-file-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.remove-file-confirm { color: rgb(var(--mx-panel-rgb)); background: rgb(var(--mx-error-rgb)); border-color: transparent; }
.remove-file-confirm:hover:not(:disabled) { background: rgb(var(--mx-error-rgb)); border-color: transparent; filter: brightness(.94); }
</style>
