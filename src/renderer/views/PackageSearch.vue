<script setup>
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { FileUp, Search, Square, ListChecks } from 'lucide-vue-next';
import { usePackagesSearchStoreUI } from '../stores/uistore/packejesSearchStoreUI';
import { iconsSerchs } from '../../shared/constants/searchItems';
import PageHeading from '../components/ui/PageHeading.vue';
const store = usePackagesSearchStoreUI();
const { queryText, searchField, formats, logs, isRunning } = storeToRefs(store);
const queryCount = computed(
  () => queryText.value.split(/\r?\n/).filter((line) => line.trim()).length,
);
</script>

<template>
  <div class="mx-page mx-auto max-w-[1400px]">
    <PageHeading
      title="Пакетный поиск"
      description="Добавьте список значений: один запрос в каждой строке. Результаты сохранятся в выбранную папку."
    />
    <div class="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <form class="mx-panel min-w-0 space-y-5 p-5 md:p-6" @submit.prevent="store.runSearch">
        <label class="block space-y-2 text-xs"
          ><span class="block font-medium text-slate-300">Тип данных</span
          ><select v-model="searchField" :disabled="isRunning" class="mx-input">
            <option v-for="field in iconsSerchs" :key="field.type" :value="field.type">
              {{ field.label }}
            </option>
          </select></label
        >
        <label class="block space-y-2 text-xs"
          ><span class="flex items-center justify-between font-medium text-slate-300"
            >Значения для поиска<span class="mx-badge">{{ queryCount }} запросов</span></span
          ><textarea
            v-model="queryText"
            :disabled="isRunning"
            class="mx-input min-h-[260px] resize-y font-mono text-xs leading-6"
            placeholder="Каждое значение — с новой строки"
          />
        </label>
        <fieldset :disabled="isRunning">
          <legend class="mb-3 text-xs font-medium text-slate-300">Форматы сохранения</legend>
          <div class="flex flex-wrap gap-2">
            <label v-for="(_, format) in formats" :key="format" class="mx-button !py-2 text-xs"
              ><input v-model="formats[format]" type="checkbox" class="accent-emerald-300" />{{
                format === 'excel' ? 'Excel' : format.toUpperCase()
              }}</label
            >
          </div>
        </fieldset>
        <div class="flex flex-wrap justify-between gap-3 border-t border-[#293443] pt-5">
          <button type="button" class="mx-button" :disabled="isRunning" @click="store.openFile">
            <FileUp class="h-4 w-4" />Загрузить TXT</button
          ><button v-if="isRunning" type="button" class="mx-button" @click="store.cancelSearch">
            <Square class="h-3 w-3 fill-current" />Остановить</button
          ><button
            v-else
            type="submit"
            class="mx-button mx-button-primary"
            :disabled="!queryCount || !Object.values(formats).some(Boolean)"
          >
            <Search class="h-4 w-4" />Начать поиск
          </button>
        </div>
      </form>
      <section class="mx-panel min-w-0 p-5">
        <div class="mb-4 flex items-center gap-2">
          <ListChecks class="h-4 w-4 text-emerald-300" />
          <h2 class="text-sm font-semibold">Ход выполнения</h2>
          <span
            v-if="isRunning"
            class="ml-auto h-2 w-2 animate-pulse rounded-full bg-emerald-300"
          ></span>
        </div>
        <div v-if="!logs.length" class="mx-empty">
          Здесь появятся этапы поиска<br />и результаты сохранения файлов.
        </div>
        <ol v-else class="max-h-[600px] space-y-3 overflow-y-auto" aria-live="polite">
          <li
            v-for="(log, index) in logs"
            :key="index"
            class="flex gap-3 border-b border-[#293443] pb-3 text-xs leading-5"
          >
            <span class="mt-0.5 shrink-0 text-[10px] tabular-nums text-slate-600">{{
              String(index + 1).padStart(2, '0')
            }}</span
            ><span class="min-w-0 break-words text-slate-400">{{ log }}</span>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
