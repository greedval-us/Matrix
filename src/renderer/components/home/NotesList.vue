<script setup>
import { Trash2, Plus, StickyNote } from 'lucide-vue-next';
import { useNotesStore } from '../../stores/notesStore';
import { useModalsStore } from '../../stores/modals';
const notesStore = useNotesStore();
const modals = useModalsStore();
</script>

<template>
  <section>
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">Заметки</h2>
      <button
        class="mx-icon-button"
        title="Добавить заметку"
        aria-label="Добавить заметку"
        @click="modals.openNoteModal()"
      >
        <Plus class="h-4 w-4" />
      </button>
    </div>
    <div v-if="!notesStore.state.notes.length" class="mx-empty">
      <StickyNote aria-hidden="true" class="mx-auto mb-3 h-6 w-6 text-matrix-muted" />Сохраняйте
      важные результаты<br />или добавьте свою первую заметку.
    </div>
    <ul v-else class="space-y-3">
      <li
        v-for="note in notesStore.state.notes"
        :key="note.id"
        class="flex items-start gap-3 rounded-lg border border-matrix-border bg-matrix-input p-4"
      >
        <div class="min-w-0 flex-1">
          <div
            class="break-words text-sm leading-6 text-matrix-secondary [&_dd]:mb-2 [&_dd]:break-all [&_dt]:text-matrix-muted [&_h2]:font-semibold"
            v-html="note.text"
          ></div>
          <p class="mt-3 text-xs text-matrix-muted">
            {{ new Date(note.createdAt).toLocaleString('ru-RU') }}
          </p>
        </div>
        <button
          class="mx-icon-button !h-7 !w-7 hover:!text-rose-300"
          title="Удалить заметку"
          aria-label="Удалить заметку"
          @click="notesStore.deleteNote(note.id)"
        >
          <Trash2 aria-hidden="true" class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
