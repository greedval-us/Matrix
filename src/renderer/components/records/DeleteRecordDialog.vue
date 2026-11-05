<script setup>
import { Trash2 } from 'lucide-vue-next';
import AppDialog from '../ui/AppDialog.vue';
const props = defineProps({ row: { type: Object, required: true }, busy: { type: Boolean, default: false }, error: { type: String, default: '' } });
const emit = defineEmits(['confirm', 'close']);
function close() { if (!props.busy) emit('close'); }
function confirm() { if (!props.busy && !props.row.files.length) emit('confirm'); }
</script>

<template>
  <AppDialog title="Удалить запись?" :busy="busy" @close="close">
    <form class="delete-record-form" :aria-busy="busy" @submit.prevent="confirm">
      <p class="delete-record-description">Запись <strong>№ {{ row.id }}</strong><template v-if="row.values.fio"> ({{ row.values.fio }})</template> будет удалена. Восстановить её через приложение не получится.</p>
      <p v-if="error" class="mx-alert text-sm" role="alert">{{ error }}</p>
      <p v-else-if="row.files.length" class="mx-alert text-sm" role="alert">Сначала удалите прикреплённые файлы, затем удалите запись.</p>
      <div class="delete-record-actions">
        <button type="button" class="mx-button" :disabled="busy" autofocus @click="close">Отмена</button>
        <button type="submit" class="mx-button delete-record-confirm" :disabled="busy || row.files.length > 0"><Trash2 aria-hidden="true" class="h-4 w-4" />{{ busy ? 'Удаляем…' : 'Удалить запись' }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.delete-record-form { display: grid; gap: 20px; }
.delete-record-description { color: rgb(var(--mx-secondary-rgb)); font-size: 14px; line-height: 1.7; overflow-wrap: anywhere; }
.delete-record-description strong { color: rgb(var(--mx-text-rgb)); font-weight: 550; }
.delete-record-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
.delete-record-confirm { color: rgb(var(--mx-panel-rgb)); background: rgb(var(--mx-error-rgb)); border-color: transparent; }
.delete-record-confirm:hover:not(:disabled) { background: rgb(var(--mx-error-rgb)); border-color: transparent; filter: brightness(.94); }
</style>
