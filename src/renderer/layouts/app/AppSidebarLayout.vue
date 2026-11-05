<script setup>
import { computed, shallowRef, useTemplateRef } from 'vue';
import { useRoute } from 'vue-router';
import { PanelLeft, ChevronRight, ShieldCheck, Sun, Moon } from 'lucide-vue-next';
import Sidebar from '../../components/AppSidebar.vue';
import NoteModal from '../../components/modal/NoteModal.vue';
import TaskModal from '../../components/modal/TaskModal.vue';
import { finishDialogLeave } from '../../components/ui/AppDialog.vue';
import { useModalsStore } from '../../stores/modals';
import { sidebarItems } from '../../../shared/constants/sidebarItems';
import { useAppearance } from '../../composables/useAppearance.js';

const isCollapsed = shallowRef(false);
const mainContent = useTemplateRef('mainContent');
const route = useRoute();
const modalsStore = useModalsStore();
const { isDark, toggleAppearance } = useAppearance();
const pageTitle = computed(
  () => sidebarItems.find((item) => item.to === route.path)?.label || 'Matrix',
);
</script>

<template>
  <div class="app-shell flex h-full min-h-0 w-full">
    <a href="#main-content" class="mx-skip-link" @click.prevent="mainContent?.focus()">
      Перейти к содержимому
    </a>
    <Sidebar v-model="isCollapsed" />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="app-toolbar flex h-16 shrink-0 items-center justify-between gap-3 px-4 md:px-7"
      >
        <div class="flex min-w-0 items-center gap-3">
          <button
            class="mx-icon-button hidden md:inline-flex"
            :aria-label="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
            :aria-expanded="!isCollapsed"
            @click="isCollapsed = !isCollapsed"
          >
            <PanelLeft aria-hidden="true" class="h-4 w-4" />
          </button>
          <span class="hidden text-[13px] text-matrix-muted lg:inline">Matrix</span>
          <ChevronRight aria-hidden="true" class="hidden h-3 w-3 text-matrix-muted lg:block" />
          <span class="truncate text-sm font-medium text-matrix-text">{{ pageTitle }}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <router-link
            to="/settings"
            class="connection-link"
            title="Настроить подключение"
            aria-label="Настроить подключение"
          >
            <ShieldCheck aria-hidden="true" class="h-4 w-4" />
            <span class="hidden sm:inline">Подключение</span>
          </router-link>
          <button
            class="mx-icon-button"
            :aria-label="isDark ? 'Включить светлую тему' : 'Включить тёмную тему'"
            :title="isDark ? 'Светлая тема' : 'Тёмная тема'"
            @click="toggleAppearance"
          >
            <component :is="isDark ? Sun : Moon" aria-hidden="true" class="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>
      <main
        ref="mainContent"
        id="main-content"
        tabindex="-1"
        class="min-h-0 min-w-0 flex-1 overflow-auto"
      >
        <router-view v-slot="{ Component, route: currentRoute }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="currentRoute.path" />
          </Transition>
        </router-view>
      </main>
    </div>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <NoteModal v-if="modalsStore.noteModalOpen" />
    </Transition>
    <Transition name="dialog" @after-leave="finishDialogLeave">
      <TaskModal v-if="modalsStore.taskModalOpen" />
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  background: var(--mx-background);
}
.app-toolbar {
  background: rgb(var(--mx-background-rgb) / 0.82);
  border-bottom: 1px solid rgb(var(--mx-border-rgb) / 0.75);
  backdrop-filter: blur(18px);
}
.connection-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 36px;
  padding: 7px 11px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  color: rgb(var(--mx-muted-rgb));
  transition:
    background var(--mx-motion-fast),
    color var(--mx-motion-fast);
}
.connection-link:hover {
  background: rgb(var(--mx-raised-rgb));
  color: rgb(var(--mx-text-rgb));
}
</style>
