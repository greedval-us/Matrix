<script setup>
import { computed, shallowRef, watch } from 'vue';
import { ChevronDown } from 'lucide-vue-next';
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
const expanded = shallowRef(additionalSelected.value > 0);
watch(additionalSelected, (count, previousCount) => {
  if (count > previousCount) expanded.value = true;
});
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
    <div>
      <button
        type="button"
        class="search-fields-disclosure flex w-full items-center justify-between gap-2 rounded-xl px-1 py-2 text-left text-[13px] font-medium text-matrix-muted"
        :aria-expanded="expanded"
        :aria-controls="'additional-fields-' + tabId"
        @click="expanded = !expanded"
      >
        <span>Другие поля<span v-if="additionalSelected" class="ml-2 text-matrix-accent">{{ additionalSelected }} выбрано</span></span>
        <ChevronDown aria-hidden="true" class="h-3.5 w-3.5 transition-transform" :class="{ 'rotate-180': expanded }" />
      </button>
      <Transition name="search-options">
      <div v-if="expanded" :id="'additional-fields-' + tabId" class="grid grid-cols-2 gap-2 pt-1">
        <SearchFieldOption
          v-for="option in additionalOptions"
          :key="option.type"
          :option="option"
          :selected="option.type in selectedFields"
          @toggle="searchUI.toggleField(tabId, option.type)"
        />
      </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.search-fields-disclosure { transition: color var(--mx-motion-fast); }
.search-fields-disclosure:hover { color: rgb(var(--mx-secondary-rgb)); }
.search-options-enter-active { transition: opacity 180ms ease, transform 180ms ease; }
.search-options-leave-active { transition: opacity 100ms ease; }
.search-options-enter-from { opacity: 0; transform: translateY(-4px); }
.search-options-leave-to { opacity: 0; }
</style>
