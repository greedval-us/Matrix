<script setup>
import SidebarItem from '@/renderer/components/ui/SidebarItem.vue';
import { sidebarItems } from '../../../shared/constants/sidebarItems.js';

defineProps({ collapsed: Boolean });
</script>

<template>
  <nav class="space-y-1 px-2" aria-label="Основная навигация">
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
