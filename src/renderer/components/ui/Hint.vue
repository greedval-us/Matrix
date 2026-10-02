<script setup>
import { ref, useId } from 'vue';
import { Info } from 'lucide-vue-next';
defineProps({ tooltip: { type: String, required: true } });
const open = ref(false);
const tooltipId = useId();
</script>

<template>
  <span class="relative inline-flex" @mouseenter="open = true" @mouseleave="open = false">
    <button
      type="button"
      class="mx-icon-button !h-6 !w-6"
      aria-label="Подсказка по формату"
      :aria-expanded="open"
      :aria-describedby="open ? tooltipId : undefined"
      @click="open = !open"
      @focus="open = true"
      @blur="open = false"
      @keydown.esc="open = false"
    >
      <Info class="h-3.5 w-3.5" />
    </button>
    <span
      v-if="open"
      :id="tooltipId"
      role="tooltip"
      class="absolute right-0 top-full z-30 mt-2 block w-[min(240px,60vw)] rounded-lg border border-[#46566b] bg-[#1b2531] p-3 text-left text-[11px] leading-5 text-slate-300 shadow-xl"
      v-html="tooltip"
    ></span>
  </span>
</template>
