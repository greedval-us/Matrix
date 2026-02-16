import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useModalsStore = defineStore('modals', () => {
  const noteModalOpen = ref(false)
  const taskModalOpen = ref(false)

  function openNoteModal() {
    noteModalOpen.value = true
  }

  function closeNoteModal() {
    noteModalOpen.value = false
  }

  function openTaskModal() {
    taskModalOpen.value = true
  }

  function closeTaskModal() {
    taskModalOpen.value = false
  }

  return {
    noteModalOpen,
    taskModalOpen,
    openNoteModal,
    closeNoteModal,
    openTaskModal,
    closeTaskModal,
  }
})
