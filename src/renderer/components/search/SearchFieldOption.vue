<script setup>
defineProps({
  option: { type: Object, required: true },
  selected: { type: Boolean, default: false },
});
defineEmits(['toggle']);
</script>

<template>
  <button
    type="button"
    :aria-pressed="selected"
    :class="[
      'flex min-h-11 min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors',
      selected
        ? 'border-matrix-accent/60 bg-matrix-accent/10 text-matrix-accent'
        : 'border-matrix-control bg-matrix-panel text-matrix-secondary hover:bg-matrix-raised hover:text-matrix-strong',
    ]"
    @click="$emit('toggle')"
  >
    <component :is="option.icon" aria-hidden="true" class="h-4 w-4 shrink-0" />
    <span class="min-w-0 [overflow-wrap:anywhere]">{{ option.label }}</span>
  </button>
</template>
