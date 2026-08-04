<script setup>
import { ref, computed } from 'vue'
import { Bookmark } from 'lucide-vue-next'
import { useTabStore } from '../../stores/tabStore'
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI'
import { iconsSerchs } from '../../../shared/constants/searchItems'
import Hint from '../ui/Hint.vue'

const tabStore = useTabStore()
const searchUI = useSearchUIStore()
const searchableFieldTypes = new Set(iconsSerchs.map(({ type }) => type))

const activeTabId = computed(() => tabStore.state.activeTabId)
const activeBase = computed(() =>
  activeTabId.value ? searchUI.getActiveBase(activeTabId.value) : null
)

const results = computed(() =>
  activeTabId.value ? searchUI.getResults(activeTabId.value) : []
)
const loading = computed(() =>
  activeTabId.value ? searchUI.getLoading(activeTabId.value) : false
)
const selectedFields = computed(() =>
  activeTabId.value ? searchUI.getSelectedFields(activeTabId.value) : {}
)

const recommendedSearches = computed(() => {
  const currentQueryValues = new Set()
  for (const [fieldKey, field] of Object.entries(selectedFields.value || {})) {
    const value = String(field?.value || '').trim()
    if (value) currentQueryValues.add(`${fieldKey}:${value}`)
  }

  const suggestions = []
  const seen = new Set()

  for (const item of results.value) {
    if (item.type === 'object_add_search' && item.fields) {
      for (const value of Object.values(item.fields)) {
        const fieldKey = value?.key
        const fieldValue = String(value?.value || '').trim()
        if (!searchableFieldTypes.has(fieldKey) || !fieldValue) continue

        const uniqueKey = `${fieldKey}:${fieldValue}`
        if (seen.has(uniqueKey) || currentQueryValues.has(uniqueKey)) continue

        seen.add(uniqueKey)
        suggestions.push({
          fieldKey,
          fieldValue,
          preload: { [fieldKey]: { key: fieldKey, value: fieldValue } },
        })
      }
      continue
    }

    if (item.type !== 'object_data' || !Array.isArray(item.fields)) continue

    for (const [fieldKey, rawValue] of item.fields) {
      const fieldValue = String(rawValue || '').trim()
      if (!searchableFieldTypes.has(fieldKey) || !fieldValue) continue

      const uniqueKey = `${fieldKey}:${fieldValue}`
      if (seen.has(uniqueKey) || currentQueryValues.has(uniqueKey)) continue

      seen.add(uniqueKey)
      suggestions.push({
        fieldKey,
        fieldValue,
        preload: { [fieldKey]: { key: fieldKey, value: fieldValue } },
      })
    }
  }

  return suggestions.slice(0, 24)
})

const preparedResults = computed(() => {
  const basesMap = {}

  results.value.forEach((item) => {
    if (item.type === 'object_data_base') {
      const key = item.source
      if (!basesMap[key]) basesMap[key] = { ...item, data: [] }
      return
    }

    if (item.type === 'object_data') {
      const key = item.source
      if (!basesMap[key]) {
        basesMap[key] = {
          type: 'object_data_base',
          source: key,
          name: key,
          info: '',
          data: [],
        }
      }
      basesMap[key].data.push(item.fields)
    }
  })

  return Object.values(basesMap)
})

function onClickFind(preload, type) {
  if (type === 0) {
    const newTabId = tabStore.addTab()
    searchUI.quickSearch(newTabId, preload)
    return
  }

  searchUI.quickSearch(activeTabId.value, preload)
}

const savedStatus = ref(null)

async function saveBaseToNotes(base) {
  if (!activeTabId.value) return

  try {
    const htmlFields = (base.data || [])
      .map((record) => {
        let fieldsHTML = ''

        if (Array.isArray(record)) {
          record.forEach(([key, value]) => {
            fieldsHTML += `<div class="flex justify-between py-1">
                             <span class="font-semibold text-gray-400">${searchUI.getFieldLabel(key)}</span>
                             <span class="text-white break-all">${value}</span>
                           </div>`
          })
        } else if (typeof record === 'object' && record !== null) {
          Object.entries(record).forEach(([key, value]) => {
            fieldsHTML += `<div class="flex justify-between py-1">
                             <span class="font-semibold text-gray-400">${key}</span>
                             <span class="text-white break-all">${value}</span>
                           </div>`
          })
        }

        return `<div class="p-3 rounded-lg mb-2 bg-neutral-800">${fieldsHTML}</div>`
      })
      .join('')

    const noteHTML = `
      <div class="p-4 rounded-lg bg-neutral-900/80">
        <h2 class="text-xl font-bold mb-2 text-white">${base.name}</h2>
        <p class="text-gray-300 mb-3 whitespace-pre-wrap">${base.info}</p>
        ${htmlFields}
      </div>
    `

    await window.storeAPI.addNote(noteHTML)
    savedStatus.value = base.name
    setTimeout(() => {
      savedStatus.value = null
    }, 2000)
  } catch (error) {
    console.error('Ошибка сохранения заметки:', error)
  }
}
</script>

<template>
  <div class="flex-1 p-4 flex flex-col gap-4 overflow-y-auto overflow-x-hidden results-container">
    <div v-if="loading" class="text-center text-neutral-400 text-sm">
      Загрузка результатов...
    </div>

    <div v-if="!loading && recommendedSearches.length" class="bg-gray-850 rounded-2xl p-4 shadow-md">
      <div class="flex flex-col gap-3">
        <h4 class="font-semibold text-green-400 text-base">Дополнительный поиск по найденным данным</h4>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="item in recommendedSearches"
            :key="`${item.fieldKey}:${item.fieldValue}`"
            @click.left="onClickFind(item.preload, 1)"
            @click.right.prevent="onClickFind(item.preload, 0)"
            class="px-3 py-2 text-sm font-medium text-white bg-neutral-800 rounded-xl hover:bg-green-700 active:bg-green-600 transition-colors duration-150 shadow-sm text-left"
            title="ЛКМ - поиск здесь, ПКМ - поиск в новой вкладке"
          >
            <span class="text-gray-400">{{ searchUI.getFieldLabel(item.fieldKey) }}:</span>
            <span class="ml-1">{{ item.fieldValue }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="!loading && preparedResults.length === 0 && recommendedSearches.length === 0"
      class="text-center text-neutral-400 py-10 text-sm"
    >
      Ничего не найдено по этому запросу.
    </div>

    <transition-group name="fade-slide" tag="div" class="space-y-4">
      <div
        v-for="(item, idx) in preparedResults"
        :key="idx"
        :data-base-name="item.type === 'object_data_base' ? item.name : null"
        class="bg-gray-850 rounded-2xl p-4 shadow-md hover:shadow-lg transition-shadow duration-300 transform hover:-translate-y-1"
        :class="{
          'border-2 border-green-500': item.type === 'object_data_base' && activeBase === item.name,
        }"
      >
        <div v-if="item.type === 'object_data_base'" class="flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2" title="Сохранить в заметки">
              <h3 class="font-semibold text-lg text-white">{{ item.name }}</h3>
              <Bookmark class="w-5 h-5 text-white cursor-pointer" @click.stop="saveBaseToNotes(item)" />
              <span v-if="savedStatus === item.name" class="text-green-500 font-semibold">Сохранено</span>
            </div>

            <Hint :tooltip="item.info" />
          </div>

          <div v-if="item.data?.length" class="mt-2 grid gap-3">
            <div
              v-for="(fields, i) in item.data"
              :key="i"
              class="bg-neutral-800 rounded-xl p-3 hover:bg-neutral-700 transition-colors duration-200 shadow-sm"
            >
              <div class="grid grid-cols-[150px_1fr] gap-x-4 gap-y-1 text-sm">
                <template v-for="([key, value], fieldIdx) in fields" :key="fieldIdx">
                  <div class="text-gray-400">{{ searchUI.getFieldLabel(key) }}</div>
                  <div class="text-white break-all">{{ value }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
