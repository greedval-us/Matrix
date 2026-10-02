<script setup>
import { Trash2, Check, Plus, ListTodo } from 'lucide-vue-next';
import { useTasksStore } from '../../stores/tasksStore';
import { useModalsStore } from '../../stores/modals';
const tasksStore = useTasksStore();
const modals = useModalsStore();
</script>

<template>
  <section>
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">Задачи</h2>
      <button
        class="mx-icon-button"
        title="Добавить задачу"
        aria-label="Добавить задачу"
        @click="modals.openTaskModal()"
      >
        <Plus class="h-4 w-4" />
      </button>
    </div>
    <div v-if="!tasksStore.state.tasks.length" class="mx-empty">
      <ListTodo class="mx-auto mb-3 h-6 w-6 text-slate-600" />Задач пока нет.<br />Добавьте задачу,
      чтобы не забыть важное.
    </div>
    <ul v-else class="divide-y divide-[#293443]">
      <li v-for="task in tasksStore.state.tasks" :key="task.id" class="flex items-start gap-3 py-4">
        <button
          class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-[#46566b]"
          :class="task.done ? '!border-emerald-300 bg-emerald-300 text-[#0d2920]' : ''"
          :aria-label="task.done ? 'Возобновить задачу' : 'Завершить задачу'"
          :aria-pressed="task.done"
          @click="tasksStore.toggleTaskDone(task.id)"
        >
          <Check v-if="task.done" class="h-3 w-3" />
        </button>
        <div class="min-w-0 flex-1">
          <h3
            :class="[
              'break-words text-sm font-medium',
              task.done ? 'text-slate-500 line-through' : 'text-slate-200',
            ]"
          >
            {{ task.title }}
          </h3>
          <p class="mt-1 break-words text-xs leading-5 text-slate-500">{{ task.text }}</p>
          <p class="mt-2 text-[10px] text-slate-600">
            {{ new Date(task.createdAt).toLocaleString('ru-RU') }}
          </p>
        </div>
        <button
          class="mx-icon-button !h-7 !w-7 hover:!text-rose-300"
          title="Удалить задачу"
          aria-label="Удалить задачу"
          @click="tasksStore.deleteTask(task.id)"
        >
          <Trash2 class="h-3.5 w-3.5" />
        </button>
      </li>
    </ul>
  </section>
</template>
