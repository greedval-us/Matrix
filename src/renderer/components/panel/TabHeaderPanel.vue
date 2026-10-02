<script setup>
import { X, LoaderCircle } from 'lucide-vue-next';
import { useTabStore } from '../../stores/tabStore';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
defineProps({ tab: { type: Object, required: true } });
const tabStore = useTabStore();
const searchUI = useSearchUIStore();
function closeTab(id) {
  if (tabStore.state.tabs.length <= 1) return;
  searchUI.cancelSearch(id);
  searchUI.clearTab(id);
  tabStore.closeTab(id);
}
</script>

<template>
  <div
    :class="[
      'flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1',
      tab.id === tabStore.state.activeTabId
        ? 'border-matrix-control bg-matrix-raised text-matrix-strong'
        : 'border-transparent text-matrix-muted hover:bg-matrix-panel',
    ]"
  >
    <input
      v-if="tabStore.state.editingTabId === tab.id"
      :value="tabStore.state.editTitle"
      class="mx-input !w-36 !py-1 text-xs"
      aria-label="Название вкладки"
      @input="tabStore.updateEditTitle($event.target.value)"
      @keyup.enter="tabStore.finishEdit(tab)"
      @blur="tabStore.finishEdit(tab)"
      autofocus
    />
    <button
      v-else
      type="button"
      class="flex max-w-[200px] items-center gap-2 px-2 py-1.5 text-xs"
      :aria-current="tab.id === tabStore.state.activeTabId ? 'page' : undefined"
      :title="tab.title + ' · Двойной щелчок для переименования'"
      @click="tabStore.setActive(tab.id)"
      @dblclick="tabStore.startEdit(tab)"
    >
      <LoaderCircle
        aria-hidden="true"
        v-if="searchUI.getLoading(tab.id)"
        class="h-3 w-3 shrink-0 animate-spin text-matrix-accent"
      /><span class="truncate">{{ tab.title }}</span>
    </button>
    <button
      v-if="tabStore.state.tabs.length > 1"
      type="button"
      class="mx-icon-button mx-icon-button-compact"
      :aria-label="'Закрыть вкладку ' + tab.title"
      @click="closeTab(tab.id)"
    >
      <X aria-hidden="true" class="h-3 w-3" />
    </button>
  </div>
</template>
