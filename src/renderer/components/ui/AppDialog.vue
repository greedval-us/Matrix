<script setup>
import { ref, onMounted, onBeforeUnmount, useId } from 'vue';
import { X } from 'lucide-vue-next';
defineProps({ title: { type: String, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null);
const titleId = useId();
onMounted(() => dialog.value.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="mx-panel m-auto max-h-[85vh] w-[calc(100%-32px)] max-w-md overflow-y-auto p-6 text-slate-200 shadow-2xl backdrop:bg-black/70"
    @cancel.prevent="emit('close')"
  >
    <header class="mb-5 flex items-center justify-between gap-4">
      <h2 :id="titleId" class="text-lg font-semibold tracking-tight">{{ title }}</h2>
      <button type="button" class="mx-icon-button" aria-label="Закрыть окно" @click="emit('close')">
        <X class="h-4 w-4" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
