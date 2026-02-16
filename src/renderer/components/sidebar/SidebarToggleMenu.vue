<script setup>
import { Menu } from 'lucide-vue-next'
const collapsed = defineModel()
const toggle = () => (collapsed.value = !collapsed.value)
</script>

<template>
  <button
    @click="toggle"
    class="fixed top-4 left-4 z-40 p-2 rounded-xl bg-neutral-900/90 shadow hover:bg-neutral-800 transition-all"
  >
      <Menu class="w-6 h-6" />
  </button>
</template>