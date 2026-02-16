<script setup>
import { ref, onMounted, onBeforeMount, onBeforeUnmount } from "vue"
import { useDatabaseStore } from "../stores/uistore/databaseStoreUI"

const dbStore = useDatabaseStore()
const dropdownOpen = ref(false)

onBeforeMount(() => dbStore.reset())
onMounted(() => dbStore.fetchAll())
onBeforeUnmount(() => dbStore.reset())

const toggleDropdown = () => {
  dropdownOpen.value = !dropdownOpen.value
}

const selectType = (type) => {
  dbStore.setFilter(type)
  dropdownOpen.value = false
}
</script>

<template>
  <div class="flex flex-col h-full p-8 max-w-7xl mx-auto space-y-6 overflow-hidden">
    <!-- Ошибки -->
    <div
      v-if="dbStore.state.error"
      class="bg-red-500/10 text-red-400 p-3 rounded-xl backdrop-blur-md shadow-lg animate-fade-in"
    >
      {{ dbStore.state.error }}
    </div>

    <!-- Панель фильтров -->
    <div class="sticky top-0 z-20 bg-neutral-900/80 p-4 rounded-xl backdrop-blur-md shadow-md flex flex-wrap items-center justify-between gap-6">
      <!-- Кастомный dropdown -->
      <div class="relative">
        <label class="font-semibold text-neutral-300 mb-1 block">Фильтр по типу:</label>
        <div
          @click="toggleDropdown"
          class="bg-neutral-800/70 text-white px-4 py-2 rounded-xl shadow-inner cursor-pointer flex justify-between items-center w-48 hover:bg-neutral-800/90 transition duration-300 ease-in-out"
        >
          <span>{{ dbStore.state.selectedType }}</span>
          <span :class="{'rotate-180': dropdownOpen}" class="transition-transform duration-300">▼</span>
        </div>
        <transition name="dropdown-fade">
          <ul
            v-if="dropdownOpen"
            class="absolute left-0 mt-1 w-full bg-neutral-800/90 rounded-xl shadow-lg backdrop-blur-md max-h-60 overflow-y-auto z-30"
          >
            <li
              v-for="type in dbStore.types"
              :key="type"
              @click="selectType(type)"
              class="px-4 py-2 cursor-pointer hover:bg-neutral-700/80 rounded-lg transition-colors duration-200"
            >
              {{ type }}
            </li>
          </ul>
        </transition>
      </div>

      <!-- Счётчики -->
      <div class="text-sm text-neutral-400 bg-neutral-900/70 px-4 py-2 rounded-xl backdrop-blur-md shadow-inner">
        Баз:
        <span class="text-white font-medium">{{ dbStore.filteredRowCount }}</span>
        |
        Всего записей:
        <span class="text-white font-medium">{{ dbStore.filteredCountSum.toLocaleString() }}</span>
      </div>
    </div>

    <!-- Таблица с фиксированным заголовком -->
    <div class="flex-1 overflow-hidden rounded-2xl shadow-2xl bg-neutral-900/70 border border-neutral-700 backdrop-blur-xl animate-scale-in">
      <div class="overflow-y-auto h-full">
        <table class="w-full text-left text-sm text-white table-fixed">
          <thead class="bg-neutral-800/70 sticky top-0 z-10">
            <tr class="text-neutral-400 text-sm">
              <th class="p-3 cursor-pointer w-[20%]" @click="dbStore.setSort('name')">Название</th>
              <th class="p-3 cursor-pointer w-[25%]" @click="dbStore.setSort('info')">Описание</th>
              <th class="p-3 cursor-pointer w-[15%]" @click="dbStore.setSort('relevance_date')">Актуальность</th>
              <th class="p-3 cursor-pointer w-[10%]" @click="dbStore.setSort('type')">Тип</th>
              <th class="p-3 cursor-pointer w-[10%] text-center" @click="dbStore.setSort('count')">Кол-во</th>
              <th class="p-3 cursor-pointer w-[10%] text-center" @click="dbStore.setSort('trust')">Надёжность</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in dbStore.filteredRows"
              :key="row.name_table"
              class="border-t border-neutral-700 hover:bg-neutral-800/70 transition-colors animate-row-fade"
            >
              <td class="p-3 font-semibold break-words">{{ row.name }}</td>
              <td class="p-3 text-xs text-neutral-400 break-words">{{ row.info }}</td>
              <td class="p-3">{{ row.relevance_date ?? "Неизвестно" }}</td>
              <td class="p-3">{{ row.type ?? "Неизвестно" }}</td>
              <td class="p-3 text-center">{{ row.count }}</td>
              <td class="p-3 text-center">
                <span v-if="row.trust" class="text-green-500 text-lg">🟢</span>
                <span v-else class="text-red-500 text-lg">🔴</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Лоадер -->
    <div
      v-if="dbStore.state.loading"
      class="text-center text-neutral-400 py-4 animate-pulse"
    >
      Загружаем данные...
    </div>
  </div>
</template>

<style scoped>
@keyframes fade-in { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
@keyframes scale-in { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
@keyframes row-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

.animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
.animate-scale-in { animation: scale-in 0.35s ease-out forwards; }
.animate-row-fade { animation: row-fade 0.25s ease-out forwards; }

.arrow-fade-enter-active, .arrow-fade-leave-active { transition: all 0.25s ease; }
.arrow-fade-enter-from { opacity: 0; transform: translateY(-4px); }
.arrow-fade-leave-to { opacity: 0; transform: translateY(4px); }

.dropdown-fade-enter-active, .dropdown-fade-leave-active { transition: all 0.25s ease; }
.dropdown-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.dropdown-fade-leave-to { opacity: 0; transform: translateY(-6px); }
</style>
