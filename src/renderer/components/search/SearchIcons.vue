<script setup>
import { computed } from 'vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const selectedFields = computed(() => searchUI.getSelectedFields(props.tabId));
</script>

<template>
  <div class="grid grid-cols-2 gap-2">
    <button
      v-for="option in searchUI.icons"
      :key="option.type"
      type="button"
      :aria-pressed="option.type in selectedFields"
      :class="[
        'flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[11px] font-medium transition-colors',
        option.type in selectedFields
          ? 'border-emerald-300/40 bg-emerald-300/10 text-emerald-200'
          : 'border-[#293443] bg-[#141b24] text-slate-400 hover:border-slate-500 hover:text-slate-200',
      ]"
      @click="searchUI.toggleField(tabId, option.type)"
    >
      <component :is="option.icon" class="h-3.5 w-3.5 shrink-0" /><span>{{ option.label }}</span>
    </button>
  </div>
</template>
