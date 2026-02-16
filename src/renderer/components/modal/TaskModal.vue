<script setup>
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useTasksStore } from '../../stores/tasksStore'
import { useModalsStore } from '../../stores/modals'

const tasksStore = useTasksStore()
const modalsStore = useModalsStore()

const title = ref('')
const description = ref('')

async function save() {
  if (!title.value.trim()) return

  await tasksStore.addTask(title.value, description.value)
  await tasksStore.loadTasks()

  title.value = ''
  description.value = ''
  modalsStore.closeTaskModal()
}
</script>

<template>
  <transition name="fade">
    <div
      v-if="modalsStore.taskModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
    >
      <transition name="scale">
        <div
          v-if="modalsStore.taskModalOpen"
          class="bg-neutral-900/95 rounded-2xl shadow-xl w-full max-w-md p-6 text-neutral-200 relative"
        >
          <button
            @click="modalsStore.closeTaskModal"
            class="absolute top-3 right-3 text-neutral-400 hover:text-neutral-200 transition"
          >
            <X class="w-5 h-5" />
          </button>

          <h2 class="text-lg font-medium mb-4">Новая задача</h2>

          <input
            v-model="title"
            type="text"
            placeholder="Название задачи"
            class="w-full p-3 bg-neutral-800/70 rounded-xl mb-3 outline-none border border-neutral-700 focus:border-neutral-500 transition"
          />
          <textarea
            v-model="description"
            placeholder="Описание задачи..."
            class="w-full p-3 bg-neutral-800/70 rounded-xl resize-none outline-none border border-neutral-700 focus:border-neutral-500 transition"
            rows="4"
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
