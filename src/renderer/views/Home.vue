<script setup>
import { onMounted, ref } from 'vue';
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
  <div class="mx-page mx-auto max-w-[1400px]">
    <PageHeading
      eyebrow="Matrix workspace"
      title="Рабочее пространство"
      description="Поиск, сохранённые записи и задачи — всё под рукой."
    />
    <div v-if="error" role="alert" class="mx-alert mb-5">{{ error }}</div>
    <section class="mx-panel mb-6 flex flex-wrap items-center justify-between gap-6 p-6">
      <div class="flex items-start gap-4">
        <span
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-matrix-accent/10"
          ><Search aria-hidden="true" class="h-5 w-5 text-matrix-accent"
        /></span>
        <div>
          <h2 class="text-lg font-semibold tracking-tight">Найдите нужные данные</h2>
          <p class="mt-1.5 max-w-lg text-sm leading-6 text-matrix-muted">
            По телефону, имени, почте и другим параметрам. Каждый запрос можно открыть в отдельной
            вкладке.
          </p>
        </div>
      </div>
      <router-link to="/search" class="mx-button mx-button-primary"
        >Новый поиск<ArrowUpRight aria-hidden="true" class="h-4 w-4"
      /></router-link>
    </section>
    <div class="mb-6 grid gap-3 sm:grid-cols-3">
      <div class="mx-panel flex items-center gap-3 p-4">
        <History aria-hidden="true" class="h-4 w-4 text-matrix-muted" /><span
          class="text-sm text-matrix-muted"
          >Запросов в истории</span
        ><strong class="ml-auto text-lg tabular-nums">{{
          historyStore.state.history.length
        }}</strong>
      </div>
      <div class="mx-panel flex items-center gap-3 p-4">
        <StickyNote aria-hidden="true" class="h-4 w-4 text-matrix-muted" /><span
          class="text-sm text-matrix-muted"
          >Заметок</span
        ><strong class="ml-auto text-lg tabular-nums">{{ notesStore.state.notes.length }}</strong>
      </div>
      <div class="mx-panel flex items-center gap-3 p-4">
        <ListTodo aria-hidden="true" class="h-4 w-4 text-matrix-muted" /><span
          class="text-sm text-matrix-muted"
          >Задач в работе</span
        ><strong class="ml-auto text-lg tabular-nums">{{
          tasksStore.state.tasks.filter((task) => !task.done).length
        }}</strong>
      </div>
    </div>
    <p v-if="loading" role="status" class="mx-empty">Загружаем рабочее пространство…</p>
    <div v-else class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div class="min-w-0 space-y-6">
        <NotesList class="mx-panel p-5" /><TasksList class="mx-panel p-5" />
      </div>
      <SearchHistoryList class="mx-panel min-w-0 p-5" />
    </div>
  </div>
</template>
