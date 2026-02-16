<script setup>
import { ref, onMounted } from 'vue'
import Sidebar from '../../components/AppSidebar.vue'
import NoteModal from '../../components/modal/NoteModal.vue'
import TaskModal from '../../components/modal/TaskModal.vue'
import { useModalsStore } from '../../stores/modals'


async function databaseMeta() {
  try {
    const data = await window.grpcAPI.databaseAll({ request: 'test' })
    const dataToSave = data.map(item => ({
      name: item.name,
      type: item.type,
      count: item.count,
      relevance_date: item.relevance_date,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))
    await window.storeAPI.set('dataMeta', dataToSave)
    console.log('✅ Данные сохранены в electron-store')
  } catch (e) {
    console.error('❌ Ошибка сохранения в electron store:', e)
  }
}

onMounted(() => {
  databaseMeta()
})

const isCollapsed = ref(false)
const modalsStore = useModalsStore()
</script>

<template>
  <div class="flex w-screen h-screen bg-neutral-950 text-neutral-200">

    <Sidebar v-model="isCollapsed" />

    <div class="flex-1 overflow-y-auto m-2 rounded-2xl bg-neutral-900 shadow-md scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-neutral-800">
      <router-view :key="$route.fullPath" />
    </div>

  <NoteModal v-if="modalsStore.noteModalOpen" />
  <TaskModal v-if="modalsStore.taskModalOpen" />

  </div>
</template>
