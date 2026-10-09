<script setup>
import { computed, onMounted, ref } from 'vue';
import { ArrowUpRight, Search, History, StickyNote, ListTodo } from 'lucide-vue-next';
import { useNotesStore } from '../stores/notesStore';
import { useTasksStore } from '../stores/tasksStore';
import { useHistoryStore } from '../stores/historyStore';
import NotesList from '../components/home/NotesList.vue';
import TasksList from '../components/home/TasksList.vue';
import SearchHistoryList from '../components/home/SearchHistoryList.vue';
import PageHeading from '../components/ui/PageHeading.vue';
const notesStore = useNotesStore();
const tasksStore = useTasksStore();
const historyStore = useHistoryStore();
const activeTasks = computed(() => tasksStore.state.tasks.filter(task => !task.done).length);
const error = ref('');
const loading = ref(true);
onMounted(async () => {
  const results = await Promise.allSettled([
    notesStore.loadNotes(),
    tasksStore.loadTasks(),
    historyStore.loadHistory(),
  ]);
  if (results.some((result) => result.status === 'rejected'))
    error.value =
      'Не удалось загрузить часть сохранённых данных. Попробуйте открыть страницу повторно.';
  loading.value = false;
});
</script>

<template>
  <div class="mx-page mx-auto max-w-[1320px]">
    <PageHeading
      title="Рабочее пространство"
      description="Ваши поиски, заметки и задачи в одном месте."
    />
    <div v-if="error" role="alert" class="mx-alert mb-5">{{ error }}</div>
    <section class="mx-panel mx-home-intro grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <div class="flex min-w-0 items-start gap-4">
        <span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-matrix-accent/10">
          <Search aria-hidden="true" class="h-6 w-6 text-matrix-accent" :stroke-width="1.7" />
        </span>
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-matrix-strong">Найдите нужные данные</h2>
          <p class="mt-2 max-w-md text-sm leading-6 text-matrix-muted">
            По имени, телефону, почте и другим параметрам.<br class="hidden lg:block" />
            Сохраняйте важные результаты и продолжайте поиск в новых вкладках.
          </p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 lg:flex-col">
        <router-link to="/search" class="mx-button mx-button-primary">
          Открыть поиск<ArrowUpRight aria-hidden="true" class="h-4 w-4" />
        </router-link>
        <router-link to="/package-search" class="mx-button">Поиск по списку</router-link>
      </div>
    </section>
    <div class="mx-home-summary">
      <div>
        <strong class="tabular-nums">{{ historyStore.state.history.length }}</strong>
        <p><History aria-hidden="true" />Запросов в истории</p>
      </div>
      <div>
        <strong class="tabular-nums">{{ notesStore.state.notes.length }}</strong>
        <p><StickyNote aria-hidden="true" />Сохранённых заметок</p>
      </div>
      <div>
        <strong class="tabular-nums">{{ activeTasks }}</strong>
        <p><ListTodo aria-hidden="true" />Задач в работе</p>
      </div>
    </div>
    <p v-if="loading" role="status" class="mx-home-loading">Загружаем рабочее пространство…</p>
    <div v-else class="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div class="min-w-0 space-y-5">
        <NotesList class="mx-panel p-6" />
        <TasksList class="mx-panel p-6" />
      </div>
      <SearchHistoryList class="mx-panel min-w-0 p-6" />
    </div>
  </div>
</template>
