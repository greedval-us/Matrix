<script setup>
import { ref } from 'vue';
import { useNotesStore } from '../../stores/notesStore';
import { useModalsStore } from '../../stores/modals';
import { escapeHtml } from '../../utils/searchResults';
import AppDialog from '../ui/AppDialog.vue';
const notes = useNotesStore();
const modals = useModalsStore();
const text = ref('');
const saving = ref(false);
const error = ref('');
async function save() {
  if (!text.value.trim() || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await notes.addNote('<p class="whitespace-pre-wrap">' + escapeHtml(text.value) + '</p>');
    modals.closeNoteModal();
  } catch (reason) {
    error.value = reason?.message || 'Не удалось сохранить заметку';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog title="Новая заметка" @close="modals.closeNoteModal()">
    <form class="space-y-4" @submit.prevent="save">
      <label class="block space-y-2 text-xs"
        ><span class="block text-slate-400">Текст заметки</span
        ><textarea
          v-model="text"
          rows="6"
          autofocus
          required
          class="mx-input resize-y leading-6"
          placeholder="Что нужно сохранить?"
        />
      </label>
      <p v-if="error" role="alert" class="mx-alert text-xs">{{ error }}</p>
      <button
        class="mx-button mx-button-primary w-full"
        type="submit"
        :disabled="saving || !text.trim()"
      >
        {{ saving ? 'Сохраняем…' : 'Сохранить заметку' }}
      </button>
    </form>
  </AppDialog>
</template>
