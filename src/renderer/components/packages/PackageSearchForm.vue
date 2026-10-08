<script setup>
import { computed } from 'vue';
import { FileUp, Search, Square } from 'lucide-vue-next';
import { SEARCH_FIELDS } from '../../../shared/constants/searchItems.js';
import { getExportFormat } from '../../services/export/exportFormats.js';
import { parseBatchQueries } from '../../utils/searchQuery.js';
defineProps({ isRunning: { type: Boolean, default: false } });
const queryText = defineModel('queryText', { type: String, required: true });
const searchField = defineModel('searchField', { type: String, required: true });
const formats = defineModel('formats', { type: Object, required: true });
const emit = defineEmits(['search', 'open-file', 'cancel']);
const queryCount = computed(() => parseBatchQueries(queryText.value).length);
const hasFormats = computed(() => Object.values(formats.value).some(Boolean));
</script>

<template>
  <form class="mx-panel min-w-0 space-y-5 p-5 md:p-6" @submit.prevent="emit('search')">
    <label class="block space-y-2 text-sm"
      ><span class="block font-medium text-matrix-secondary">Тип данных</span
      ><select v-model="searchField" :disabled="isRunning" class="mx-input">
        <option v-for="field in SEARCH_FIELDS" :key="field.type" :value="field.type">
          {{ field.label }}
        </option>
      </select></label
    >
    <label class="block space-y-2 text-sm"
      ><span class="flex items-center justify-between font-medium text-matrix-secondary"
        >Значения для поиска<span class="mx-badge">{{ queryCount }} запросов</span></span
      ><textarea
        v-model="queryText"
        :disabled="isRunning"
        class="mx-input min-h-[260px] resize-y font-mono text-sm leading-6"
        placeholder="Каждое значение — с новой строки"
      />
    </label>
    <fieldset :disabled="isRunning">
      <legend class="mb-3 text-sm font-medium text-matrix-secondary">Форматы сохранения</legend>
      <div class="flex flex-wrap gap-2">
        <label v-for="(_, format) in formats" :key="format" class="mx-button !py-2 text-sm"
          ><input :checked="formats[format]" @change="formats = { ...formats, [format]: $event.target.checked }" type="checkbox" class="accent-matrix-accent" />{{
            getExportFormat(format).label
          }}</label
        >
      </div>
    </fieldset>
    <div class="flex flex-wrap justify-between gap-3 border-t border-matrix-border pt-5">
      <button type="button" class="mx-button" :disabled="isRunning" @click="emit('open-file')">
        <FileUp aria-hidden="true" class="h-4 w-4" />Загрузить TXT</button
      ><button v-if="isRunning" type="button" class="mx-button" @click="emit('cancel')">
        <Square aria-hidden="true" class="h-3 w-3 fill-current" />Остановить</button
      ><button
        v-else
        type="submit"
        class="mx-button mx-button-primary"
        :disabled="!queryCount || !hasFormats"
      >
        <Search aria-hidden="true" class="h-4 w-4" />Начать поиск
      </button>
    </div>
  </form>
</template>
