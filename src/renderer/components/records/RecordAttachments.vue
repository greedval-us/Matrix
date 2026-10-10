<script setup>
import { computed } from 'vue';
import { Download, File, Loader2, Plus, Trash2 } from 'lucide-vue-next';
import { attachmentOperationKey, formatAttachmentSize } from '../../utils/records.js';

const props = defineProps({
  row: { type: Object, required: true },
  capabilities: { type: Object, default: () => ({}) },
  pending: { type: Boolean, default: false },
  pendingFiles: { type: Array, default: () => [] },
});
const emit = defineEmits(['upload', 'download', 'remove']);
const files = computed(() => props.row.files || []);
const pendingFileKeys = computed(() => new Set(props.pendingFiles));

function isFilePending(file) {
  return pendingFileKeys.value.has(attachmentOperationKey(props.row.id, file.id));
}

function actionLabel(action, file) {
  return `${action} файл «${file.name}» из записи ${props.row.id}`;
}
</script>

<template>
  <div class="record-attachments" :aria-busy="pending">
    <ul v-if="files.length" class="record-attachment-list" aria-label="Файлы записи">
      <li v-for="file in files" :key="file.id" class="record-attachment">
        <File aria-hidden="true" class="record-file-icon" />
        <div class="record-file-details">
          <span class="record-file-name" :title="file.name">{{ file.name }}</span>
          <span v-if="formatAttachmentSize(file.size)" class="record-file-size">
            {{ formatAttachmentSize(file.size) }}
          </span>
        </div>
        <div class="record-file-actions" :aria-busy="isFilePending(file)">
          <button
            type="button"
            class="mx-icon-button mx-icon-button-compact"
            :aria-label="actionLabel('Скачать', file)"
            :title="capabilities.download ? 'Скачать файл' : 'Скачивание недоступно'"
            :disabled="pending || isFilePending(file) || capabilities.download !== true"
            @click="emit('download', { row, file })"
          >
            <Download aria-hidden="true" class="h-4 w-4" />
          </button>
          <button
            type="button"
            class="mx-icon-button mx-icon-button-compact record-file-remove"
            :aria-label="actionLabel('Удалить', file)"
            :title="capabilities.remove ? 'Удалить файл' : 'Удаление недоступно'"
            :disabled="pending || isFilePending(file) || capabilities.remove !== true"
            @click="emit('remove', { row, file })"
          >
            <Trash2 aria-hidden="true" class="h-4 w-4" />
          </button>
        </div>
      </li>
    </ul>
    <p v-else class="record-files-empty">Нет файлов</p>
    <button
      type="button"
      class="record-upload"
      :disabled="pending || capabilities.upload !== true"
      :title="capabilities.upload ? 'Добавить файлы к записи' : 'Загрузка недоступна'"
      :aria-label="`Добавить файлы к записи ${row.id}`"
      @click="emit('upload', row)"
    >
      <Loader2 v-if="pending" aria-hidden="true" class="h-3.5 w-3.5" />
      <Plus v-else aria-hidden="true" class="h-3.5 w-3.5" />
      {{ pending ? 'Выполняем…' : 'Добавить файлы' }}
    </button>
  </div>
</template>

<style scoped>
.record-attachments { min-width: 250px; max-width: 350px; }
.record-attachment-list { display: grid; gap: 8px; }
.record-attachment { display: flex; align-items: center; gap: 8px; min-width: 0; }
.record-file-icon { flex: none; width: 16px; height: 16px; color: var(--mx-muted); }
.record-file-details { flex: 1; min-width: 0; }
.record-file-name { display: block; max-width: 240px; overflow-wrap: anywhere; font-size: 13px; line-height: 1.45; }
.record-file-size { display: block; color: var(--mx-muted); font-size: 11px; margin-top: 2px; }
.record-file-actions { display: flex; flex: none; gap: 1px; }
.record-file-remove:hover:not(:disabled) { color: rgb(var(--mx-error-rgb)); background: var(--mx-error-surface); }
.record-files-empty { font-size: 13px; color: var(--mx-muted); }
.record-upload { display: inline-flex; align-items: center; gap: 5px; margin-top: 8px; padding: 5px 0; color: var(--mx-accent); font-size: 12px; font-weight: 550; border-radius: 5px; transition: color var(--mx-motion-fast); }
.record-upload:hover:not(:disabled) { color: var(--mx-accent-hover); }
</style>
