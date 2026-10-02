<script setup>
import { ref } from 'vue';
import { useTasksStore } from '../../stores/tasksStore';
import { useModalsStore } from '../../stores/modals';
import AppDialog from '../ui/AppDialog.vue';
const tasks = useTasksStore();
const modals = useModalsStore();
const title = ref('');
const description = ref('');
const saving = ref(false);
const error = ref('');
async function save() {
  if (!title.value.trim() || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await tasks.addTask(title.value.trim(), description.value);
    modals.closeTaskModal();
  } catch (reason) {
    error.value = reason?.message || 'Не удалось сохранить задачу';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppDialog title="Новая задача" @close="modals.closeTaskModal()">
    <form class="space-y-4" @submit.prevent="save">
      <label class="block space-y-2 text-xs"
        ><span class="block text-slate-400">Название</span
        ><input
          v-model="title"
          required
          autofocus
          class="mx-input"
          placeholder="Что нужно сделать?" /></label
      ><label class="block space-y-2 text-xs"
        ><span class="block text-slate-400">Описание</span
        ><textarea
          v-model="description"
          rows="4"
          class="mx-input resize-y leading-6"
          placeholder="Подробности задачи"
        />
      </label>
      <p v-if="error" role="alert" class="mx-alert text-xs">{{ error }}</p>
      <button
        class="mx-button mx-button-primary w-full"
        type="submit"
        :disabled="saving || !title.trim()"
      >
        {{ saving ? 'Сохраняем…' : 'Добавить задачу' }}
      </button>
    </form>
  </AppDialog>
</template>
