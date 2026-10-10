<script>
const dialogOpeners = new WeakMap();

export function finishDialogLeave(element) {
  const opener = dialogOpeners.get(element);
  dialogOpeners.delete(element);
  element.close();
  // Vue removes the dialog before after-leave; restore focus explicitly after cleanup.
  if (opener?.isConnected && !document.querySelector('dialog[open]')) {
    opener.focus({ preventScroll: true });
  }
}
</script>

<script setup>
import { ref, onMounted, useId } from 'vue';
import { X } from 'lucide-vue-next';
defineProps({ title: { type: String, required: true } });
const emit = defineEmits(['close']);
const dialog = ref(null);
const titleId = useId();
onMounted(() => {
  dialogOpeners.set(dialog.value, document.activeElement);
  dialog.value.showModal();
});
</script>

<template>
  <dialog
    ref="dialog"
    :aria-labelledby="titleId"
    class="mx-panel mx-dialog m-auto max-h-[85vh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto p-7 text-matrix-text"
    @cancel.prevent="emit('close')"
  >
    <header class="mb-5 flex items-center justify-between gap-4">
      <h2 :id="titleId" class="text-lg font-semibold tracking-tight">{{ title }}</h2>
      <button type="button" class="mx-icon-button" aria-label="Закрыть окно" @click="emit('close')">
        <X aria-hidden="true" class="h-4 w-4" />
      </button>
    </header>
    <slot />
  </dialog>
</template>
