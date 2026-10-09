<script setup>
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
import Hint from '../ui/Hint.vue';
const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const selectedFields = computed(() => searchUI.getSelectedFields(props.tabId));
</script>

<template>
  <div>
    <TransitionGroup name="search-field" tag="div" class="space-y-5">
    <div v-for="(field, type) in selectedFields" :key="type" class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <label :for="'search-' + tabId + '-' + type" class="text-[13px] font-medium text-matrix-secondary">{{
          searchUI.getFieldLabel(type)
        }}</label>
        <div class="flex items-center gap-1">
          <Hint :tooltip="searchUI.getHelp(type)" /><button
            type="button"
            class="mx-icon-button mx-icon-button-compact"
            :aria-label="'Удалить поле ' + searchUI.getFieldLabel(type)"
            @click="searchUI.toggleField(tabId, type)"
          >
            <X aria-hidden="true" class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <input
        :id="'search-' + tabId + '-' + type"
        :value="field.value"
        type="text"
        autocomplete="off"
        class="mx-input search-value-input text-sm"
        :aria-invalid="Boolean(field.value && !field.valid)"
        :aria-describedby="
          field.value && !field.valid ? 'format-help-' + tabId + '-' + type : undefined
        "
        :inputmode="
          ['number', 'passport', 'inn', 'snils', 'imei', 'imsi'].includes(type) ? 'numeric' : 'text'
        "
        :placeholder="field.placeholder"
        @input="field.setValue($event.target.value)"
      />
      <p
        v-if="field.value && !field.valid"
        :id="'format-help-' + tabId + '-' + type"
        class="mx-warning search-format-hint text-xs leading-5"
      >
        Проверьте формат: {{ field.placeholder }}
      </p>
    </div>
    </TransitionGroup>
    <p v-if="!Object.keys(selectedFields).length" class="text-xs leading-6 text-matrix-muted">
      Выберите тип данных выше, чтобы добавить поле.
    </p>
  </div>
</template>

<style scoped>
.search-value-input { min-height: 48px; border-radius: 12px; }
.search-format-hint { padding: 8px 10px; border-radius: 9px; }
.search-field-enter-active { transition: opacity 180ms ease, transform 180ms ease; }
.search-field-leave-active { transition: opacity 100ms ease, transform 100ms ease; }
.search-field-enter-from, .search-field-leave-to { opacity: 0; transform: translateY(-4px); }
</style>
