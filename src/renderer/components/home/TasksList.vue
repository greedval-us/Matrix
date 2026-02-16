<script setup>
import { Trash2, CheckCircle } from 'lucide-vue-next'
import { useTasksStore } from '../../stores/tasksStore'

const tasksStore = useTasksStore()
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4 text-white">Задачи</h2>

    <transition-group
      name="list-fade"
      tag="ul"
      class="space-y-3"
    >
      <li
        v-for="task in tasksStore.state.tasks"
        :key="task.id"
        :class="[ 
          'p-4 rounded-2xl flex justify-between items-start border shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300',
          task.done 
            ? 'bg-neutral-800/70 border-neutral-700' 
            : 'bg-neutral-900/80 border-neutral-800'
        ]"
      >
        <div class="flex-1 pr-4">
          <div :class="['font-semibold text-base', task.done ? 'line-through text-gray-400' : 'text-white']">
            {{ task.title }}
          </div>
          <div class="text-sm text-gray-400">{{ task.text }}</div>
          <div class="text-xs text-gray-500 mt-2">
            {{ new Date(task.createdAt).toLocaleString('ru-RU') }}
          </div>
        </div>

        <div class="flex flex-col gap-3 items-center">
          <button
            @click="tasksStore.toggleTaskDone(task.id)"
            :title="task.done ? 'Сделать невыполненной' : 'Отметить как выполненную'"
            class="p-1 rounded-full transition-all duration-200"
            :class="task.done 
              ? 'text-yellow-300 hover:text-yellow-400 bg-neutral-700/50' 
              : 'text-green-400 hover:text-green-500 bg-neutral-700/50'"
          >
            <CheckCircle class="w-5 h-5" />
          </button>

          <button
            @click="tasksStore.deleteTask(task.id)"
            class="p-1 text-red-400 hover:text-red-500 transition-all duration-200 rounded-full bg-neutral-700/50"
            title="Удалить задачу"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </li>
    </transition-group>
  </div>
</template>

<style scoped>
.list-fade-enter-active,
.list-fade-leave-active {
  transition: all 0.3s ease;
}
.list-fade-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.97);
}
.list-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px) scale(0.97);
}
</style>
