<script setup>
import { PanelLeftClose, PanelLeftOpen, Layers3 } from 'lucide-vue-next';
import SidebarNav from './sidebar/SidebarNav.vue';
import SidebarBot from './sidebar/SidebarBot.vue';
const isCollapsed = defineModel({ type: Boolean, default: false });
</script>

<template>
  <aside
    :class="[
      'flex h-full shrink-0 flex-col border-r border-matrix-border bg-matrix-rail',
      isCollapsed ? 'w-16' : 'w-16 md:w-56',
    ]"
  >
    <router-link
      to="/"
      class="flex h-16 shrink-0 items-center gap-3 border-b border-matrix-border px-4"
      aria-label="Matrix — главная"
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-matrix-accent text-matrix-on-accent"
        ><Layers3 class="h-5 w-5"
      /></span>
      <span v-if="!isCollapsed" class="hidden text-lg font-semibold tracking-tight md:block"
        >Matrix<span class="ml-1 text-matrix-accent">.</span></span
      >
    </router-link>
    <div class="min-h-0 flex-1 overflow-y-auto py-6">
      <p v-if="!isCollapsed" class="mx-eyebrow mb-3 hidden px-6 md:block">Навигация</p>
      <SidebarNav :collapsed="isCollapsed" />
    </div>
    <SidebarBot v-model="isCollapsed" />
    <div class="hidden items-center justify-between border-t border-matrix-border p-3 md:flex">
      <span v-if="!isCollapsed" class="px-2 text-xs text-matrix-muted">Matrix · Search client</span>
      <button
        class="mx-icon-button"
        :aria-label="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        @click="isCollapsed = !isCollapsed"
      >
        <component :is="isCollapsed ? PanelLeftOpen : PanelLeftClose" class="h-4 w-4" />
      </button>
    </div>
  </aside>
</template>
