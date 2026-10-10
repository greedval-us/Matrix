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
      'search-field-option flex min-h-11 min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13px] font-medium',
      selected
        ? 'search-field-option-selected border-matrix-accent/30 bg-matrix-accent/10 text-matrix-accent'
        : 'border-matrix-border/80 bg-matrix-panel/70 text-matrix-secondary hover:bg-matrix-raised/70 hover:text-matrix-strong',
    ]"
    @click="$emit('toggle')"
  >
    <component :is="option.icon" aria-hidden="true" class="h-4 w-4 shrink-0" />
    <span class="min-w-0 [overflow-wrap:anywhere]">{{ option.label }}</span>
  </button>
</template>

<style scoped>
.search-field-option {
  transition: background var(--mx-motion-standard), border-color var(--mx-motion-standard),
    color var(--mx-motion-standard), box-shadow var(--mx-motion-standard);
}
.search-field-option-selected { box-shadow: inset 0 0 0 0.5px rgb(var(--mx-accent-rgb) / 0.12); }
.search-field-option:active { background: rgb(var(--mx-accent-rgb) / 0.16); }
</style>
