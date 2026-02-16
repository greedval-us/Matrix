<script setup>
import { ref, onMounted } from "vue"
import { useNotesStore } from "../stores/notesStore"
import { useTasksStore } from "../stores/tasksStore"
import { useHistoryStore } from "../stores/historyStore"

import NotesList from "../components/home/NotesList.vue"
import TasksList from "../components/home/TasksList.vue"
import SearchHistoryList from "../components/home/SearchHistoryList.vue"

const notesStore = useNotesStore()
const tasksStore = useTasksStore()
const historyStore = useHistoryStore()

const showNotes = ref(true)
const showTasks = ref(true)

onMounted(async () => {
  await Promise.all([
    notesStore.loadNotes(),
    tasksStore.loadTasks(),
    historyStore.loadHistory(),
  ])
})
</script>

<template>
  <div class="flex h-full text-white bg-neutral-950 font-sans gap-6 p-4">
    <div class="relative w-2/3 flex flex-col gap-6 overflow-y-auto overflow-x-hidden">
      <transition name="fade-slide">
        <NotesList
          v-if="showNotes"
          class="m-5 bg-neutral-900/70 backdrop-blur-xl rounded-2xl p-5 shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
        />
      </transition>

      <transition name="fade-slide">
        <TasksList
          v-if="showTasks"
          class="m-5 bg-neutral-900/70 backdrop-blur-xl rounded-2xl p-5 shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300"
        />
      </transition>

      <!-- Переключатели -->
      <div
        class="fixed bottom-6 right-1/3 flex gap-6 bg-neutral-900/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg border border-neutral-700 z-20"
      >
        <label class="flex items-center gap-3 cursor-pointer select-none">
          <span class="whitespace-nowrap text-white font-medium">Заметки</span>
          <div class="relative">
            <input type="checkbox" v-model="showNotes" class="sr-only peer" />
            <div class="w-10 h-5 rounded-full bg-neutral-700 peer-checked:bg-gradient-to-r peer-checked:from-green-500 peer-checked:to-green-600 transition-all"></div>
            <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition-all peer-checked:translate-x-5"></div>
          </div>
        </label>

        <label class="flex items-center gap-3 cursor-pointer select-none">
          <span class="whitespace-nowrap text-white font-medium">Задачи</span>
          <div class="relative">
            <input type="checkbox" v-model="showTasks" class="sr-only peer" />
            <div class="w-10 h-5 rounded-full bg-neutral-700 peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-blue-600 transition-all"></div>
            <div class="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transform transition-all peer-checked:translate-x-5"></div>
          </div>
        </label>
      </div>
    </div>

    <div class="relative w-1/3">
      <SearchHistoryList
        class="bg-neutral-900/70 backdrop-blur-xl rounded-2xl p-5 shadow-lg hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 h-full flex flex-col"
      />
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from {
  opacity: 0;
  transform: translateY(20px) scale(0.98);
}
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}
</style>
