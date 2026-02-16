<script setup>
defineProps({
  tooltip: {
    type: String,
    required: true
  }
})
</script>

<template>
  <div class="relative group inline-block">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-5 w-5 text-neutral-400 cursor-pointer"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M13 16h-1v-4h-1m1-4h.01M12 20a8 8 0 100-16 8 8 0 000 16z"
      />
    </svg>

    <div
      class="absolute right-full top-1/2 -translate-y-1/2 mr-2
             bg-neutral-900 text-xs text-neutral-200 p-2 rounded-lg
             shadow-lg border border-neutral-700
             opacity-0 group-hover:opacity-100 transition-opacity
             pointer-events-none z-10 max-w-[250px] min-w-[240px] w-auto text-left"
      v-html="tooltip"
    />
  </div>
</template>

<style scoped>
div.group:hover > div {
  transform: translateY(-50%) translateX(-5px);
  transition: all 0.5s ease;
}
</style>
