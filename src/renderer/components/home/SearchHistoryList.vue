<script setup>
import { Trash2 } from "lucide-vue-next"
import { useHistoryStore } from "../../stores/historyStore"
import { useRouter } from "vue-router"

const historyStore = useHistoryStore()
const router = useRouter()


function repeatSearch(entry) {
  router.push({
    name: "Search",
    query: {
      key: entry.key,
      value: entry.value
    }
  })
}
</script>

<template>
  <div class="relative h-full flex flex-col overflow-x-hidden">
    <div class="shrink-0">
      <h2 class="text-xl font-semibold mb-4 text-white">История запросов</h2>
    </div>

    <transition-group name="list-fade" tag="ul" class="flex-1 overflow-y-auto overflow-x-hidden space-y-3 pr-1">
      <li
        v-for="entry in historyStore.state.history"
        :key="entry.id"
        class="bg-neutral-900/70 m-3 backdrop-blur-md p-4 rounded-2xl text-sm border hover:border-green-500 border-neutral-800 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300 cursor-pointer"
        @click="repeatSearch(entry)"
      >
        <div class="flex justify-between items-center mb-2">
          <span class="text-xs text-neutral-400">
            {{ new Date(entry.createdAt).toLocaleString('ru-RU') }}
          </span>
        </div>
        <div class="text-white space-y-1 break-words">
          <div>
            <span class="text-neutral-400 font-medium">{{ entry.key }}:</span>
            <span class="ml-1">{{ entry.value }}</span>
          </div>
        </div>
      </li>
    </transition-group>

    <div class="shrink-0 mt-4 flex justify-end">
      <button
        @click="historyStore.clearHistory"
        class="bg-neutral-800/90 backdrop-blur-lg px-4 py-2 rounded-full shadow-md border border-neutral-700 text-white hover:text-red-500 hover:border-red-500 hover:shadow-lg transition flex items-center gap-2"
        title="Очистить историю"
      >
        <Trash2 class="w-5 h-5" />
        <span class="hidden sm:inline">Очистить</span>
      </button>
    </div>
  </div>
</template>
