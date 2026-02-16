<script setup>
import SidebarHeader from './sidebar/SidebarHeader.vue'
import SidebarNav from './sidebar/SidebarNav.vue'
import SidebarToggleChevron from './sidebar/SidebarToggleChevron.vue'
import SidebarToggleMenu from './sidebar/sidebarToggleMenu.vue'
import SidebarBot from './sidebar/SidebarBot.vue'

const isCollapsed = defineModel()
</script>

<template>
    <aside
      :class="[
        'h-full bg-neutral-900 rounded-r-2xl shadow-lg flex flex-col justify-between overflow-hidden',
        'transition-[width] duration-300 ease-in-out',
        isCollapsed ? 'w-16' : 'w-56'
      ]"
    >
    <div class="flex-1">
      <SidebarToggleMenu v-model="isCollapsed" />
      <SidebarHeader :collapsed="isCollapsed" />
      <SidebarNav :collapsed="isCollapsed" />
    </div>

    <SidebarBot v-model="isCollapsed" />

    <SidebarToggleChevron v-model="isCollapsed" />

  </aside>
</template>