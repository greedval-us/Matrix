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
    class="sidebar-item"
    :class="{ 'is-collapsed': collapsed }"
    exact-active-class="sidebar-item-active"
  >
    <component :is="iconComponent" aria-hidden="true" class="h-[18px] w-[18px] shrink-0" />
    <span class="item-label">{{ label }}</span>
  </router-link>
</template>

<style scoped>
.sidebar-item {
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 42px;
  border-radius: 10px;
  padding: 10px 15px;
  color: rgb(var(--mx-muted-rgb));
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  transition:
    color var(--mx-motion-fast),
    background var(--mx-motion-fast),
    box-shadow var(--mx-motion-fast);
}
.sidebar-item:hover {
  color: rgb(var(--mx-strong-rgb));
  background: rgb(var(--mx-raised-rgb) / 0.8);
}
.sidebar-item-active {
  color: var(--mx-accent);
  background: rgb(var(--mx-accent-rgb) / 0.11);
  box-shadow: inset 0 0 0 1px rgb(var(--mx-accent-rgb) / 0.05);
  font-weight: 600;
}
.sidebar-item-active:hover {
  color: var(--mx-accent);
  background: rgb(var(--mx-accent-rgb) / 0.15);
}
.item-label {
  display: none;
  min-width: 0;
  overflow: hidden;
  transition:
    opacity var(--mx-motion-fast),
    max-width var(--mx-motion-standard);
}
@media (min-width: 768px) {
  .item-label {
    display: block;
    max-width: 155px;
    opacity: 1;
  }
  .is-collapsed .item-label {
    max-width: 0;
    opacity: 0;
  }
}
</style>
