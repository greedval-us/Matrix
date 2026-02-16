<script setup>
import { Trash2 } from "lucide-vue-next"
import { useNotesStore } from "../../stores/notesStore"

const notesStore = useNotesStore()

const deleteNote = async (id) => {
  await notesStore.deleteNote(id)
}
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4 text-white">Заметки</h2>

    <transition-group
      name="list-fade"
      tag="ul"
      class="space-y-3"
    >
      <li
        v-for="note in notesStore.state.notes"
        :key="note.id"
        class="p-4 rounded-2xl bg-neutral-900/70 flex justify-between items-start shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300"
      >
        <div class="flex flex-col gap-1 w-full">
          <!-- Используем v-html для рендеринга HTML -->
          <div class="font-medium leading-snug break-words text-white" v-html="note.text"></div>
          <div class="text-xs text-neutral-400">
            {{ new Date(note.createdAt).toLocaleString("ru-RU") }}
          </div>
        </div>

        <button
          @click="deleteNote(note.id)"
          class="flex items-center justify-center text-red-400 hover:text-red-500 p-2 rounded-full transition hover:bg-red-500/20"
          title="Удалить заметку"
        >
          <Trash2 class="w-5 h-5" />
        </button>
      </li>
    </transition-group>
  </div>
</template>

<style scoped>
.list-fade-enter-active,
.list-fade-leave-active {
  transition: all 0.3s ease;
}
.list-fade-enter-from,
.list-fade-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
</style>
