<script setup>
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next';
import matrixLogo from '../../public/matrix.png';
import SidebarNav from './sidebar/SidebarNav.vue';
import SidebarBot from './sidebar/SidebarBot.vue';
const isCollapsed = defineModel({ type: Boolean, default: false });
</script>

<template>
  <aside
    class="app-sidebar flex h-full shrink-0 flex-col"
    :class="{ 'is-collapsed': isCollapsed }"
    aria-label="Боковая панель"
  >
    <router-link
      to="/"
      class="sidebar-brand flex h-16 shrink-0 items-center gap-3"
      aria-label="Matrix — главная"
    >
      <img
        :src="matrixLogo"
        alt=""
        width="32"
        height="32"
        class="brand-mark h-8 w-8 shrink-0 object-contain"
      />
      <span class="brand-name sidebar-label">Matrix</span>
    </router-link>
    <div class="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-5">
      <SidebarNav :collapsed="isCollapsed" />
    </div>
    <SidebarBot v-model="isCollapsed" />
    <div class="sidebar-footer hidden items-center justify-between gap-2 md:flex">
      <span class="sidebar-label text-xs text-matrix-muted">Клиент поиска</span>
      <button
        class="mx-icon-button"
        :aria-label="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
        @click="isCollapsed = !isCollapsed"
      >
        <component
          :is="isCollapsed ? PanelLeftOpen : PanelLeftClose"
          aria-hidden="true"
          class="h-4 w-4"
        />
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-sidebar {
  width: 68px;
  background: rgb(var(--mx-rail-rgb) / 0.8);
  border-right: 1px solid rgb(var(--mx-border-rgb) / 0.8);
  backdrop-filter: blur(24px);
  transition: width var(--mx-motion-standard) cubic-bezier(0.2, 0.7, 0.2, 1);
  overflow: hidden;
}
.sidebar-brand {
  padding: 0 18px;
  white-space: nowrap;
}
.brand-mark {
  display: block;
  border-radius: 8px;
}
.brand-name {
  color: rgb(var(--mx-strong-rgb));
  font-size: 20px;
  line-height: 1;
  font-weight: 650;
  letter-spacing: -0.04em;
}
.sidebar-label {
  display: none;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  transition:
    opacity var(--mx-motion-fast),
    max-width var(--mx-motion-standard);
}
.sidebar-footer {
  min-height: 58px;
  padding: 10px 16px;
  border-top: 1px solid rgb(var(--mx-border-rgb) / 0.7);
}
@media (min-width: 768px) {
  .app-sidebar {
    width: 232px;
  }
  .app-sidebar.is-collapsed {
    width: 68px;
  }
  .sidebar-label {
    display: block;
    max-width: 160px;
    opacity: 1;
  }
  .is-collapsed .sidebar-label {
    max-width: 0;
    opacity: 0;
  }
  .is-collapsed .sidebar-footer {
    gap: 0;
  }
}
</style>
