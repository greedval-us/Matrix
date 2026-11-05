<script setup>
import { useId } from 'vue';
import { Save } from 'lucide-vue-next';
import AppDialog from '../ui/AppDialog.vue';
import { CONTROL_RECORD_FIELDS } from '../../../shared/constants/controlRecord.js';

const props = defineProps({
  editor: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
});
const emit = defineEmits(['change', 'save', 'close']);
const formId = useId();
function close() { if (!props.busy) emit('close'); }
function save() { if (!props.busy) emit('save'); }
</script>

<template>
  <AppDialog :title="editor.mode === 'create' ? 'Новая запись' : 'Редактировать запись'" :busy="busy" class="record-editor-dialog" @close="close">
    <form class="record-editor-form" :aria-busy="busy" :aria-describedby="error ? `${formId}-error` : undefined" @submit.prevent="save">
      <p v-if="editor.mode === 'edit'" class="record-editor-id">ID записи: <span>{{ editor.rowId }}</span></p>
      <div class="record-editor-fields">
        <div v-for="(field, index) in CONTROL_RECORD_FIELDS" :key="field.key" class="record-editor-field" :class="{ 'record-editor-wide': field.type === 'textarea' }">
          <label :for="`${formId}-${field.key}`" class="record-editor-label">{{ field.label }}</label>
          <textarea v-if="field.type === 'textarea'" :id="`${formId}-${field.key}`" :name="field.key" class="mx-input record-editor-textarea" :value="editor.values[field.key]" :disabled="busy" rows="3"
            @input="emit('change', field.key, $event.target.value)" />
          <input v-else :id="`${formId}-${field.key}`" :name="field.key" class="mx-input" :type="field.type" :value="editor.values[field.key]" :disabled="busy" :autofocus="index === 0" :max="field.type === 'date' ? '9999-12-31' : undefined" :min="field.type === 'date' ? '1000-01-01' : undefined"
            @input="emit('change', field.key, $event.target.value)" />
        </div>
      </div>
      <p v-if="error" :id="`${formId}-error`" class="mx-alert text-sm" role="alert">{{ error }}</p>
      <div class="record-editor-actions">
        <button type="button" class="mx-button" :disabled="busy" @click="close">Отмена</button>
        <button type="submit" class="mx-button mx-button-primary" :disabled="busy"><Save aria-hidden="true" class="h-4 w-4" />{{ busy ? 'Сохраняем…' : 'Сохранить' }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.record-editor-dialog { max-width: 640px; }
.record-editor-form { display: grid; gap: 20px; }
.record-editor-id { color: var(--mx-muted); font-size: 12px; overflow-wrap: anywhere; }
.record-editor-id span { color: rgb(var(--mx-secondary-rgb)); }
.record-editor-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.record-editor-field { min-width: 0; }
.record-editor-wide { grid-column: 1 / -1; }
.record-editor-label { display: block; margin-bottom: 7px; color: rgb(var(--mx-secondary-rgb)); font-size: 13px; font-weight: 550; }
.record-editor-textarea { display: block; min-height: 84px; resize: vertical; }
.record-editor-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; }
@media (max-width: 560px) { .record-editor-fields { grid-template-columns: minmax(0, 1fr); } }
</style>
