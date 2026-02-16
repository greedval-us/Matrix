<script setup>
import { computed } from 'vue'
import * as Icons from 'lucide-vue-next'

const props = defineProps({
  to: String,
  icon: String,
  label: String,
  collapsed: Boolean,
})

const iconComponent = computed(() => Icons[props.icon])
</script>

<template>
  <router-link
    :to="props.to"
    class="flex items-center px-4 py-2 rounded-xl hover:bg-neutral-800 hover:text-white transition text-sm"
    active-class="bg-neutral-800 text-white"
  >
    <component :is="iconComponent" class="w-5 h-5" />
    <span v-show="!props.collapsed" class="ml-3">{{ props.label }}</span>
  </router-link>
</template>