<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { PanelLeft, ChevronRight } from 'lucide-vue-next';
import Sidebar from '../../components/AppSidebar.vue';
import NoteModal from '../../components/modal/NoteModal.vue';
import TaskModal from '../../components/modal/TaskModal.vue';
import { useModalsStore } from '../../stores/modals';
import { sidebarItems } from '../../../shared/constants/sidebarItems';

const isCollapsed = ref(false);
const mainContent = ref(null);
const route = useRoute();
const modalsStore = useModalsStore();
const pageTitle = computed(
  () => sidebarItems.find((item) => item.to === route.path)?.label || 'Matrix',
);
</script>

<template>
  <div class="flex h-full min-h-0 w-full bg-matrix-canvas">
    <a href="#main-content" class="mx-skip-link" @click.prevent="mainContent?.focus()">
      Перейти к содержимому
    </a>
    <Sidebar v-model="isCollapsed" />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-matrix-border px-4 md:px-7"
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
          <span class="hidden text-xs text-matrix-muted lg:inline">Рабочее пространство</span>
          <ChevronRight aria-hidden="true" class="hidden h-3 w-3 text-matrix-muted lg:block" />
          <span class="truncate text-sm font-medium text-matrix-text">{{ pageTitle }}</span>
        </div>
        <router-link to="/settings" class="mx-badge min-h-9 shrink-0" title="Настроить подключение"
          ><span class="h-1.5 w-1.5 rounded-full bg-matrix-accent"></span>gRPC / TLS</router-link
        >
      </header>
      <main
        ref="mainContent"
        id="main-content"
        tabindex="-1"
        class="min-h-0 min-w-0 flex-1 overflow-auto"
      >
        <router-view />
      </main>
    </div>
    <NoteModal v-if="modalsStore.noteModalOpen" />
    <TaskModal v-if="modalsStore.taskModalOpen" />
  </div>
</template>
