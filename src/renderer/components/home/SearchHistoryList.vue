<script setup>
import { ArrowUpRight, Trash2, History } from 'lucide-vue-next';
import { useHistoryStore } from '../../stores/historyStore';
import { key as fieldLabels } from '../../../shared/constants/translateKey';
import { useRouter } from 'vue-router';
const historyStore = useHistoryStore();
const router = useRouter();
function repeatSearch(entry) {
  router.push({ name: 'Search', query: { key: entry.key, value: entry.value } });
}
</script>

<template>
  <section>
    <div class="mb-4 flex items-center justify-between gap-3">
      <h2 class="text-sm font-semibold">История запросов</h2>
      <button
        class="mx-icon-button"
        :disabled="!historyStore.state.history.length"
        aria-label="Очистить историю"
        title="Очистить историю"
        @click="historyStore.clearHistory"
      >
        <Trash2 class="h-3.5 w-3.5" />
      </button>
    </div>
    <div v-if="!historyStore.state.history.length" class="mx-empty">
      <History class="mx-auto mb-3 h-6 w-6 text-slate-600" />История пока пуста.<br />Ваши запросы
      появятся здесь.
    </div>
    <ul v-else class="max-h-[560px] space-y-1 overflow-y-auto">
      <li v-for="entry in historyStore.state.history" :key="entry.id">
        <button
          class="flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left hover:bg-[#1b2531]"
          title="Повторить поиск"
          @click="repeatSearch(entry)"
        >
          <History class="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" />
          <div class="min-w-0 flex-1">
            <p class="break-words text-xs text-slate-100">{{ entry.value }}</p>
            <p class="mt-1.5 text-[10px] text-slate-500">
              {{ fieldLabels[entry.key] || entry.key }} ·
              {{ new Date(entry.createdAt).toLocaleString('ru-RU') }}
            </p>
          </div>
          <ArrowUpRight class="mt-1 h-3.5 w-3.5 shrink-0 text-slate-500" />
        </button>
      </li>
    </ul>
  </section>
</template>
