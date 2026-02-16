<script setup>
import { ChevronLeft } from 'lucide-vue-next'
const collapsed = defineModel()
const toggle = () => (collapsed.value = !collapsed.value)
</script>

<template>
  <button
    @click="toggle"
    class="h-12 flex items-center justify-center hover:bg-neutral-800 transition rounded-xl m-2"
  >
    <ChevronLeft
      :class="['w-5 h-5 transition-transform duration-200', collapsed ? 'rotate-180' : '']"
    />
  </button>
</template>
