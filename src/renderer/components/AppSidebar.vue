<script setup>
import { PanelLeftClose, PanelLeftOpen, Layers3 } from 'lucide-vue-next';
import SidebarNav from './sidebar/SidebarNav.vue';
import SidebarBot from './sidebar/SidebarBot.vue';
const isCollapsed = defineModel({ type: Boolean, default: false });
</script>

<template>
  <aside
    :class="[
      'flex h-full shrink-0 flex-col border-r border-[#293443] bg-[#101720] transition-[width] duration-200',
      isCollapsed ? 'w-16' : 'w-16 md:w-56',
    ]"
  >
    <router-link
      to="/"
      class="flex h-16 shrink-0 items-center gap-3 border-b border-[#293443] px-4"
      aria-label="Matrix — главная"
    >
      <span
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-300 text-[#10382a]"
        ><Layers3 class="h-5 w-5"
      /></span>
      <span v-if="!isCollapsed" class="hidden text-lg font-semibold tracking-tight md:block"
        >Matrix<span class="ml-1 text-emerald-300">.</span></span
      >
    </router-link>
    <div class="min-h-0 flex-1 overflow-y-auto py-6">
      <p v-if="!isCollapsed" class="mx-eyebrow mb-3 hidden px-6 md:block">Навигация</p>
      <SidebarNav :collapsed="isCollapsed" />
    </div>
    <SidebarBot v-model="isCollapsed" />
    <div class="hidden items-center justify-between border-t border-[#293443] p-3 md:flex">
      <span v-if="!isCollapsed" class="px-2 text-[11px] text-slate-500"
        >Matrix · Search client</span
      >
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
