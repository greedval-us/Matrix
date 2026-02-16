<script setup>
import { ref, onMounted } from "vue"
import { storeToRefs } from "pinia"
import { usePackagesSearchStoreUI } from "../stores/uistore/packejesSearchStoreUI"
import { FileUp, Search, ChevronDown } from "lucide-vue-next"

const store = usePackagesSearchStoreUI()
const { queryText, searchField, formats, logs } = storeToRefs(store)

const dropdownOpen = ref(false)
const fields = [
  { value: "number", label: "Телефон" },
  { value: "mail", label: "E-mail" },
  { value: "snils", label: "СНИЛС" },
  { value: "inn", label: "ИНН" },
  { value: "passport", label: "Паспорт" },
  { value: "fio", label: "ФИО" },
  { value: "date_of_birth", label: "Дата рождения" },
  { value: "telegram", label: "Telegram" },
  { value: "vk", label: "ВКонтакте" },
  { value: "facebook", label: "Facebook" },
  { value: "grz", label: "Госномер (ГРЗ)" },
  { value: "vin", label: "VIN" },
]

onMounted(() => {
  store.resetState()
})

function handleFile() {
  store.openFile()
}
function startSearch() {
  store.runSearch()
}
function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
}
function selectField(field) {
  store.searchField = field.value
  dropdownOpen.value = false
}
</script>


<template>
  <div
    class="flex h-full gap-6 bg-gradient-to-br from-neutral-900 to-neutral-950 text-gray-100 font-[system-ui] p-6"
  >
    <!-- Левая панель -->
    <div
      class="w-2/3 flex flex-col gap-6 p-6 bg-neutral-900/70 backdrop-blur-xl 
             shadow-xl rounded-3xl border border-neutral-700/70
             transition-all duration-300"
    >
      <label class="text-sm text-gray-400 mb-1 block">Поле для поиска</label>
      <textarea
        v-model="queryText"
        placeholder="Введите параметры построчно"
        class="w-full h-48 p-4 rounded-2xl bg-neutral-800/80 border border-neutral-700
               focus:ring-2 focus:ring-neutral-500 outline-none resize-none
               transition-all duration-200"
      />

      <!-- Кастомный SELECT -->
      <div class="relative">
        <label class="text-sm text-gray-400 mb-1 block">Тип данных</label>
        <div
          @click="toggleDropdown"
          class="bg-neutral-800/80 text-white px-4 py-3 rounded-2xl shadow-inner cursor-pointer
                 flex justify-between items-center hover:bg-neutral-800/90 transition duration-300 ease-in-out"
        >
          <span>
            {{
              fields.find((f) => f.value === searchField)?.label || "Выберите поле"
            }}
          </span>
          <ChevronDown
            :class="[
              'w-4 h-4 ml-2 transition-transform duration-300',
              dropdownOpen ? 'rotate-180' : ''
            ]"
          />
        </div>

        <transition name="dropdown-fade">
          <ul
            v-if="dropdownOpen"
            class="absolute left-0 mt-1 w-full bg-neutral-800/90 rounded-xl shadow-lg
                   backdrop-blur-md max-h-60 overflow-y-auto z-30"
          >
            <li
              v-for="field in fields"
              :key="field.value"
              @click="selectField(field)"
              class="px-4 py-2 cursor-pointer hover:bg-neutral-700/80 rounded-lg
                     transition-colors duration-200"
            >
              {{ field.label }}
            </li>
          </ul>
        </transition>
      </div>

      <div class="flex flex-wrap gap-4 mt-2">
        <label
          v-for="(val, key) in formats"
          :key="key"
          class="flex items-center gap-2 cursor-pointer select-none
                 px-3 py-2 rounded-xl bg-neutral-800/60 hover:bg-neutral-700/60
                 transition"
        >
          <input type="checkbox" v-model="formats[key]" class="accent-blue-500" />
          <span class="font-medium">{{ key.toUpperCase() }}</span>
        </label>
      </div>

      <div class="flex gap-4 mt-auto">
        <button
          @click="handleFile"
          class="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-neutral-500 to-neutral-600
                 hover:from-neutral-400 hover:to-neutral-500 transition
                 shadow-lg shadow-neutral-500/30"
        >
          <FileUp class="w-5 h-5" />
          Выбрать файл
        </button>
        <button
          @click="startSearch"
          class="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-green-500 to-green-600
                 hover:from-green-400 hover:to-green-500 transition
                 shadow-lg shadow-green-500/30"
        >
          <Search class="w-5 h-5" />
          Запустить поиск
        </button>
      </div>
    </div>

    <!-- Правая панель -->
    <div
      class="w-1/3 p-6 bg-neutral-900/80 backdrop-blur-xl 
             rounded-3xl shadow-xl overflow-y-auto 
             border border-neutral-700/70
             transition-all duration-300"
    >
      <h2 class="font-semibold text-lg mb-4">Логи выполнения</h2>
      <transition-group name="fade" tag="div" class="space-y-2 text-sm">
        <div
          v-for="(log, i) in logs"
          :key="i"
          class="border-b border-neutral-700 pb-1"
        >
          {{ log }}
        </div>
      </transition-group>
    </div>
  </div>
</template>

<style scoped>
.dropdown-fade-enter-active,
.dropdown-fade-leave-active {
  transition: all 0.25s ease; 
}
.dropdown-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.dropdown-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
