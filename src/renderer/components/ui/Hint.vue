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
      class="mx-icon-button mx-icon-button-compact"
      aria-label="Подсказка по формату"
      :aria-expanded="open"
      :aria-describedby="open ? tooltipId : undefined"
      @click="open = !open"
      @focus="open = true"
      @blur="open = false"
      @keydown.esc="open = false"
    >
      <Info aria-hidden="true" class="h-3.5 w-3.5" />
    </button>
    <span
      v-if="open"
      :id="tooltipId"
      role="tooltip"
      class="absolute right-0 top-full z-30 mt-2 block w-[min(240px,60vw)] rounded-lg border border-matrix-control bg-matrix-raised p-3 text-left text-xs leading-5 text-matrix-secondary shadow-xl"
      v-html="tooltip"
    ></span>
  </span>
</template>
