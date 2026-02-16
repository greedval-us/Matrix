<script setup>
import { computed } from 'vue'
import { useTabStore } from '../../stores/tabStore'
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI'
import Hint from '../ui/Hint.vue'

const tabStore = useTabStore()
const searchUI = useSearchUIStore()

const activeTabId = computed(() => tabStore.state.activeTabId)
const selectedFields = computed(() => searchUI.getSelectedFields(activeTabId.value))

function removeFieldHandler(type) {
  searchUI.toggleField(activeTabId.value, type)
}
</script>


<template>
  <div class="flex flex-col gap-2">
    <transition-group name="fade" tag="div" class="flex flex-col gap-2">
      <div
        v-for="(field, type) in selectedFields"
        :key="type"
        class="flex flex-col gap-1 bg-neutral-800 p-2 rounded border border-neutral-700"
      >
        <div class="flex justify-between items-center mb-1">
          <span class="text-sm">{{ searchUI.getFieldLabel(type) }}</span>
          <div class="flex items-center gap-1">
            <Hint :tooltip="searchUI.getHelp(type)" />
            <button
              @click="removeFieldHandler(type)"
              class="flex items-center justify-center w-6 h-6 
                     text-neutral-300 hover:text-red-500 
                     bg-neutral-700 hover:bg-neutral-600 
                     rounded transition-colors duration-200 
                     text-xs leading-none text-center"
            >
              ×
            </button>
          </div>
        </div>

        <input
          :value="field.value"
          @input="field.setValue($event.target.value)"
          type="text"
          :inputmode="['date_of_birth', 'mail'].includes(type) ? 'text' : 'numeric'"
          :class="[
            'w-full px-3 py-2 rounded bg-neutral-800 text-white border focus:outline-none focus:ring-neutral-600',
            !field.value
              ? 'border-neutral-600'
              : field.valid
              ? 'border-green-600'
              : 'border-yellow-500'
          ]"
          :placeholder="field.placeholder || `Введите ${searchUI.getFieldLabel(type)}`"
        />
      </div>
    </transition-group>
  </div>
</template>


<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: all 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}
</style>
