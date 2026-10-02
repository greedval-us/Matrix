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
  <div class="space-y-4">
    <div v-for="(field, type) in selectedFields" :key="type" class="space-y-2">
      <div class="flex items-center justify-between gap-2">
        <label :for="'search-' + tabId + '-' + type" class="text-xs font-medium text-slate-200">{{
          searchUI.getFieldLabel(type)
        }}</label>
        <div class="flex items-center gap-1">
          <Hint :tooltip="searchUI.getHelp(type)" /><button
            type="button"
            class="mx-icon-button !h-6 !w-6"
            :aria-label="'Удалить поле ' + searchUI.getFieldLabel(type)"
            @click="searchUI.toggleField(tabId, type)"
          >
            <X class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <input
        :id="'search-' + tabId + '-' + type"
        :value="field.value"
        type="text"
        autocomplete="off"
        class="mx-input text-sm"
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
        class="text-xs leading-5 text-amber-300"
      >
        Проверьте формат: {{ field.placeholder }}
      </p>
    </div>
    <p v-if="!Object.keys(selectedFields).length" class="text-xs leading-6 text-slate-500">
      Выберите тип данных выше, чтобы добавить поле.
    </p>
  </div>
</template>
