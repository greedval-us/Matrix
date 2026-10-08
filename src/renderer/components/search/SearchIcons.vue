<script setup>
import { computed } from 'vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
import SearchFieldOption from './SearchFieldOption.vue';
import { PRIMARY_SEARCH_FIELD_IDS } from '../../../shared/constants/searchItems.js';
const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const selectedFields = computed(() => searchUI.getSelectedFields(props.tabId));
const primaryTypes = new Set(PRIMARY_SEARCH_FIELD_IDS);
const primaryOptions = computed(() =>
  searchUI.icons.filter((option) => primaryTypes.has(option.type)),
);
const additionalOptions = computed(() =>
  searchUI.icons.filter((option) => !primaryTypes.has(option.type)),
);
const additionalSelected = computed(
  () => additionalOptions.value.filter((option) => option.type in selectedFields.value).length,
);
</script>

<template>
  <div class="space-y-3">
    <div class="grid grid-cols-2 gap-2">
      <SearchFieldOption
        v-for="option in primaryOptions"
        :key="option.type"
        :option="option"
        :selected="option.type in selectedFields"
        @toggle="searchUI.toggleField(tabId, option.type)"
      />
    </div>
    <details :open="additionalSelected > 0" class="rounded-lg border border-matrix-border px-3">
      <summary class="cursor-pointer py-3 text-[13px] font-medium text-matrix-secondary">
        Другие поля · {{ additionalOptions.length }}
        <span v-if="additionalSelected" class="ml-2 text-matrix-accent">
          Выбрано: {{ additionalSelected }}
        </span>
      </summary>
      <div class="grid grid-cols-2 gap-2 pb-3">
        <SearchFieldOption
          v-for="option in additionalOptions"
          :key="option.type"
          :option="option"
          :selected="option.type in selectedFields"
          @toggle="searchUI.toggleField(tabId, option.type)"
        />
      </div>
    </details>
  </div>
</template>
