<script setup>
import { computed, watch } from 'vue';
import { FileUp, Search, Square, FileText } from 'lucide-vue-next';
import { DEFAULT_SEARCH_FIELD, SEARCH_FIELDS } from '../../../shared/constants/searchItems.js';
import { REPORT_IDENTIFIER_FIELD_IDS } from '../../../shared/constants/reportPolicy.js';
import { getExportFormat } from '../../services/export/exportFormats.js';
import { parseBatchQueries } from '../../utils/searchQuery.js';
defineProps({ isRunning: { type: Boolean, default: false } });
const queryText = defineModel('queryText', { type: String, required: true });
const searchField = defineModel('searchField', { type: String, required: true });
const formats = defineModel('formats', { type: Object, required: true });
const mode = defineModel('mode', { type: String, default: 'search' });
const emit = defineEmits(['search', 'open-file', 'cancel']);
const queryCount = computed(() => parseBatchQueries(queryText.value).length);
const hasFormats = computed(() => Object.values(formats.value).some(Boolean));
const reportMode = computed(() => mode.value === 'report');
const availableFields = computed(() => reportMode.value
  ? SEARCH_FIELDS.filter((field) => REPORT_IDENTIFIER_FIELD_IDS.includes(field.type)) : SEARCH_FIELDS);
watch(mode, () => {
  if (reportMode.value && !REPORT_IDENTIFIER_FIELD_IDS.includes(searchField.value)) searchField.value = DEFAULT_SEARCH_FIELD;
});
</script>

<template>
  <form class="mx-panel min-w-0 space-y-5 p-5 md:p-6" @submit.prevent="emit('search')">
    <fieldset :disabled="isRunning" class="space-y-2">
      <legend class="mb-2 text-sm font-medium text-matrix-secondary">Режим выполнения</legend>
      <div class="package-mode-selector flex flex-wrap gap-2">
        <label class="mx-button flex-1 text-sm" :class="{ 'package-mode-selected': !reportMode }">
          <input v-model="mode" type="radio" name="package-mode" value="search" class="accent-matrix-accent" />
          Обычный поиск
        </label>
        <label class="mx-button flex-1 text-sm" :class="{ 'package-mode-selected': reportMode }">
          <input v-model="mode" type="radio" name="package-mode" value="report" class="accent-matrix-accent" />
          Сбор отчётов
        </label>
      </div>
    </fieldset>
    <label class="block space-y-2 text-sm"
      ><span class="block font-medium text-matrix-secondary">Тип данных</span
      ><select v-model="searchField" :disabled="isRunning" class="mx-input">
        <option v-for="field in availableFields" :key="field.type" :value="field.type">
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
    <div v-if="reportMode" class="package-report-description space-y-2 rounded-xl p-4 text-xs leading-5 text-matrix-muted">
      <p class="flex items-center gap-2 font-medium text-matrix-secondary"><FileText aria-hidden="true" class="h-4 w-4 text-matrix-accent" />Один отчёт DOCX на каждый точный идентификатор</p>
      <p>Найденные телефоны, документы и другие идентификаторы проверяются автоматически. Повторы объединяются. ФИО, дата рождения и маски в сборе не участвуют.</p>
      <p>При остановке найденные данные текущего отчёта сохранятся с отметкой о неполном сборе.</p>
    </div>
    <fieldset v-else :disabled="isRunning">
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
        <Square aria-hidden="true" class="h-3 w-3 fill-current" />{{ reportMode ? 'Остановить сбор' : 'Остановить' }}</button
      ><button
        v-else
        type="submit"
        class="mx-button mx-button-primary"
        :disabled="!queryCount || (!reportMode && !hasFormats)"
      >
        <FileText v-if="reportMode" aria-hidden="true" class="h-4 w-4" />
        <Search v-else aria-hidden="true" class="h-4 w-4" />{{ reportMode ? 'Собрать отчёты' : 'Начать поиск' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.package-mode-selector .mx-button { justify-content: center; min-width: 150px; }
.package-mode-selected { border-color: rgb(var(--mx-accent-rgb) / 0.35); background: rgb(var(--mx-accent-rgb) / 0.07); }
.package-report-description { background: rgb(var(--mx-raised-rgb) / 0.6); }
</style>
