<script setup>
import { computed } from 'vue';
import { House, SearchCheck, PackageSearch, Database, Settings, Info } from 'lucide-vue-next';
const props = defineProps({ to: String, icon: String, label: String, collapsed: Boolean });
const icons = {
  House,
  SearchCheckIcon: SearchCheck,
  PackageSearch,
  Database,
  Settings,
  InfoIcon: Info,
};
const iconComponent = computed(() => icons[props.icon]);
</script>

<template>
  <router-link
    :to="to"
    :title="label"
    :aria-label="label"
    class="flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-[13px] font-medium text-matrix-muted transition-colors hover:bg-matrix-raised hover:text-matrix-strong"
    exact-active-class="!bg-matrix-accent/10 !text-matrix-accent"
  >
    <component :is="iconComponent" class="h-[18px] w-[18px] shrink-0" />
    <span v-if="!collapsed" class="hidden md:inline">{{ label }}</span>
  </router-link>
</template>
