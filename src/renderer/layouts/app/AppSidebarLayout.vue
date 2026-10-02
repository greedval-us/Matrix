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
const route = useRoute();
const modalsStore = useModalsStore();
const pageTitle = computed(
  () => sidebarItems.find((item) => item.to === route.path)?.label || 'Matrix',
);
</script>

<template>
  <div class="flex h-full min-h-0 w-full bg-[#0d1117]">
    <Sidebar v-model="isCollapsed" />
    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#293443] px-4 md:px-7"
      >
        <div class="flex min-w-0 items-center gap-3">
          <button
            class="mx-icon-button hidden md:inline-flex"
            :aria-label="isCollapsed ? 'Развернуть меню' : 'Свернуть меню'"
            :aria-expanded="!isCollapsed"
            @click="isCollapsed = !isCollapsed"
          >
            <PanelLeft class="h-4 w-4" />
          </button>
          <span class="hidden text-xs text-slate-500 lg:inline">Рабочее пространство</span>
          <ChevronRight class="hidden h-3 w-3 text-slate-600 lg:block" />
          <span class="truncate text-sm font-medium text-slate-200">{{ pageTitle }}</span>
        </div>
        <router-link to="/settings" class="mx-badge shrink-0" title="Настроить подключение"
          ><span class="h-1.5 w-1.5 rounded-full bg-emerald-300"></span>gRPC / TLS</router-link
        >
      </header>
      <main id="main-content" class="min-h-0 min-w-0 flex-1 overflow-auto">
        <router-view />
      </main>
    </div>
    <NoteModal v-if="modalsStore.noteModalOpen" />
    <TaskModal v-if="modalsStore.taskModalOpen" />
  </div>
</template>
