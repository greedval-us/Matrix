<script setup>
import { computed, reactive, ref } from 'vue';
import AppDialog from '../ui/AppDialog.vue';
import { CONTROL_FILTER_FIELDS, CONTROL_FILTER_MAX_LENGTH, CONTROL_LOCATIONS, normalizeControlFilters } from '../../../shared/constants/controlRecord.js';

const props = defineProps({
  columns: { type: Array, required: true },
  filters: { type: Object, required: true },
});
const emit = defineEmits(['apply', 'close']);
const draft = reactive({ ...props.filters });
const error = ref('');
const fields = computed(() => props.columns.filter(({ key }) => CONTROL_FILTER_FIELDS.includes(key)));
function apply() {
  try { emit('apply', normalizeControlFilters(draft)); }
  catch (reason) { error.value = reason.message; }
}
</script>

<template>
  <AppDialog title="Фильтры по столбцам" class="records-filters-dialog" @close="emit('close')">
    <form class="records-filter-form" @submit.prevent="apply">
      <div class="records-filter-grid">
        <label v-for="column in fields" :key="column.key">
          <span>{{ column.label }}</span>
          <select v-if="column.key === 'location'" v-model="draft.location" name="location" class="mx-input">
            <option value="">Все варианты</option>
            <option v-for="value in CONTROL_LOCATIONS" :key="value" :value="value">{{ value }}</option>
          </select>
          <input v-else v-model="draft[column.key]" :name="column.key" class="mx-input" autocomplete="off"
            :type="column.key === 'date' ? 'date' : 'search'" :maxlength="CONTROL_FILTER_MAX_LENGTH"
            :min="column.key === 'date' ? '1000-01-01' : undefined" :max="column.key === 'date' ? '9999-12-31' : undefined" />
        </label>
      </div>
      <p v-if="error" role="alert" class="mx-alert text-sm">{{ error }}</p>
      <div class="records-filter-actions">
        <button type="button" class="mx-button" @click="emit('apply', {})">Сбросить фильтры</button>
        <button type="submit" class="mx-button mx-button-primary">Применить</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.records-filters-dialog { max-width: 730px; }
.records-filter-form, .records-filter-grid { display: grid; gap: 14px; }
.records-filter-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.records-filter-grid label { display: grid; gap: 6px; min-width: 0; color: rgb(var(--mx-secondary-rgb)); font-size: 13px; }
.records-filter-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
@media (max-width: 660px) { .records-filter-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
