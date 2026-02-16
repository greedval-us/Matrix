<script setup>
import { ref, onMounted } from 'vue'
import { StoreService } from '../services/StoreService'

const store = new StoreService(window.storeAPI)
const SERVER_KEY = 'serverAddress'

const serverAddress = ref('')
const error = ref('')

const loadServerAddress = async () => {
  try {
    const exists = await store.has(SERVER_KEY)
    if (exists) {
      const value = await store.get(SERVER_KEY)
      serverAddress.value = value || ''
    } else {
      const defaultAddress = '10.0.0.1:5196'
      await store.set(SERVER_KEY, defaultAddress)
      serverAddress.value = defaultAddress
    }
  } catch (e) {
    error.value = 'Не удалось загрузить адрес сервера'
    console.error(e)
  }
}

onMounted(loadServerAddress)

const saveAddress = async () => {
  if (!serverAddress.value) {
    error.value = 'Адрес не может быть пустым'
    return
  }
  try {
    await store.set(SERVER_KEY, serverAddress.value)
    error.value = ''
    alert('Перезапустите приложение чтобы настройки вступили в силу')
  } catch (e) {
    error.value = 'Не удалось сохранить адрес'
    console.error(e)
  }
}
</script>

<template>
  <div class="h-full flex items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-950 p-6">
    <div class="w-full max-w-md bg-neutral-900/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-neutral-700 p-8 space-y-6 text-white transition-all hover:shadow-3xl">
      
      <h2 class="text-3xl font-bold text-center text-white drop-shadow-md">Настройки сервера</h2>

      <div class="space-y-2">
        <label for="server-address" class="text-sm font-medium text-neutral-300">Адрес сервера</label>
        <input
          id="server-address"
          v-model="serverAddress"
          placeholder="127.0.0.1:5196"
          class="w-full p-4 bg-neutral-800 border border-neutral-600 rounded-2xl text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:border-transparent transition-all shadow-inner hover:bg-neutral-700"
        >
      </div>

      <button
        @click="saveAddress"
        class="w-full py-3 bg-neutral-700 hover:bg-neutral-600 rounded-2xl font-semibold text-white text-lg transition shadow-md hover:shadow-lg"
      >
        Сохранить
      </button>

      <transition name="fade">
        <div v-if="error" class="text-red-400 text-center text-sm bg-red-900/30 px-3 py-2 rounded-xl border border-red-500 mt-2">
          {{ error }}
        </div>
      </transition>

    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
