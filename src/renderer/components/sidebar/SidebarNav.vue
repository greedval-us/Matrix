<script setup>
import SidebarItem from '@/renderer/components/ui/SidebarItem.vue'
import { sidebarItems } from '../../../shared/constants/sidebarItems.js'

defineProps({ collapsed: Boolean })
</script>

<template>
  <nav class="px-2 space-y-1 mt-4">
    <SidebarItem
      v-for="item in sidebarItems"
      :key="item.to"
      :to="item.to"
      :icon="item.icon"
      :label="item.label"
      :collapsed="collapsed"
    />
  </nav>
</template>
