<script setup>
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useNotesStore } from '../../stores/notesStore'
import { useModalsStore } from '../../stores/modals'

const notesStore = useNotesStore()
const modalsStore = useModalsStore()

const noteText = ref('')

async function save() {
  if (!noteText.value.trim()) return
  await notesStore.addNote(noteText.value)
  await notesStore.loadNotes()
  noteText.value = ''
  modalsStore.closeNoteModal()
}
</script>

<template>
  <transition name="fade">
    <div
      v-if="modalsStore.noteModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <transition name="scale">
        <div
          v-if="modalsStore.noteModalOpen"
          class="bg-neutral-900/95 rounded-2xl shadow-xl w-full max-w-md p-6 text-neutral-200 relative"
        >
          <button
            @click="modalsStore.closeNoteModal"
            class="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 transition"
          >
            <X class="w-5 h-5" />
          </button>

          <h2 class="text-lg font-medium mb-4">Новая заметка</h2>

          <textarea
            v-model="noteText"
            placeholder="Введите текст заметки..."
            class="w-full p-3 bg-neutral-800/70 rounded-xl resize-none outline-none border border-neutral-700 focus:border-neutral-500 transition"
            rows="5"
          ></textarea>

          <button
            @click="save"
            class="mt-4 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 px-4 py-2 rounded-xl w-full transition"
          >
            Сохранить
          </button>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.scale-enter-active,
.scale-leave-active {
  transition: all 0.25s ease;
}
.scale-enter-from {
  transform: scale(0.95);
  opacity: 0;
}
.scale-leave-to {
  transform: scale(0.98);
  opacity: 0;
}
</style>
