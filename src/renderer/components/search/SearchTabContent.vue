<script setup>
import { ref, computed, watch, nextTick, reactive } from 'vue'
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import SearchIcons from './SearchIcons.vue'
import SearchInputs from './SearchInputs.vue'
import SearchButton from './SearchButton.vue'
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI'
import { useTabStore } from '../../stores/tabStore'
import SearchResults from './SearchResults.vue'

const searchUI = useSearchUIStore()
const tabStore = useTabStore()
const isCollapsed = ref(false)

const toggleCollapse = () => (isCollapsed.value = !isCollapsed.value)

const activeTabId = computed(() => tabStore.state.activeTabId)
const activeBase = computed(() => activeTabId.value ? searchUI.getActiveBase(activeTabId.value) : null)

// ======= Группировка баз по type_sources =======
const collapsedGroups = reactive({})

const baseGroups = computed(() => {
  if (!activeTabId.value) return []
  
  const results = searchUI.getResults(activeTabId.value)
  const groupsMap = {}
  
  results.forEach(item => {
    if (item.type === 'object_data_base') {
      const type = item.type_sources || 'Без типа'
      if (!groupsMap[type]) {
        groupsMap[type] = { type, items: [] }
        // Инициализируем группу как свернутую
        if (collapsedGroups[type] === undefined) {
          collapsedGroups[type] = true
        }
      }
      groupsMap[type].items.push(item)
    }
  })
  
  return Object.values(groupsMap)
})

function toggleGroup(name) {
  collapsedGroups[name] = !collapsedGroups[name]
}

function selectBase(name) {
  if (!activeTabId.value) return
  searchUI.setActiveBase(name, activeTabId.value)
}

watch(
  [() => activeTabId.value, () => activeBase.value, () => baseGroups.value.length],
  async () => {
    await nextTick()
    await nextTick()
    
    const baseName = typeof activeBase.value === 'string' ? activeBase.value : activeBase.value?.name
    if (!baseName) return
    
    const container = document.querySelector('.results-container')
    const el = container?.querySelector(`[data-base-name="${baseName}"]`)
    if (el && container) {
      container.scrollTo({
        top: el.offsetTop,
        behavior: 'smooth'
      })
    }
  },
  { immediate: true }
)
</script>

<template>
  <div class="flex h-full text-white bg-gradient-to-br from-neutral-900 to-neutral-950">
    <div class="w-[40%] p-6 border-r border-neutral-700 flex flex-col gap-4 overflow-y-auto backdrop-blur-md bg-neutral-900/70 rounded-tr-2xl rounded-br-2xl shadow-inner">
      <SearchIcons />
      <SearchButton />
      
      <!-- Поля поиска -->
      <div class="flex items-center justify-between cursor-pointer mt-6 p-2 rounded-xl hover:bg-neutral-800/70 transition-all duration-200"
           @click="toggleCollapse">
        <h3 class="font-semibold text-lg">Поля поиска</h3>
        <component :is="isCollapsed ? ChevronDown : ChevronUp" class="w-5 h-5 text-neutral-300" />
      </div>
      
      <transition name="fade-slide">
        <div v-if="!isCollapsed" class="flex flex-col gap-3 mt-3 bg-neutral-800/60 p-4 rounded-2xl shadow-inner backdrop-blur-sm">
          <SearchInputs :tab-id="activeTabId" />
        </div>
      </transition>
      
      <!-- Группы баз по типу -->
      <div class="mt-6 h-full overflow-y-auto">
        <ul class="flex flex-col gap-2">
          <li v-for="group in baseGroups" :key="group.type">
            <div class="flex items-center justify-between cursor-pointer p-2 rounded-lg hover:bg-neutral-800/70 transition-all duration-200"
                 @click="toggleGroup(group.type)">
              <span class="font-semibold">{{ group.type }}</span>
              <component :is="collapsedGroups[group.type] ? ChevronDown : ChevronUp" class="w-5 h-5 text-neutral-300" />
            </div>
            
            <transition name="fade-slide">
              <ul v-if="!collapsedGroups[group.type]" class="pl-4 mt-1 flex flex-col gap-1">
                <li v-for="base in group.items" 
                    :key="base.name" 
                    @click="selectBase(base.name)"
                    :class="[
                      'cursor-pointer p-2 rounded-lg hover:bg-green-700 transition-colors duration-200',
                      activeBase === base.name ? 'bg-green-700 font-semibold' : 'text-white'
                    ]"
                    :data-base-name="base.name">
                  {{ base.name }}
                </li>
              </ul>
            </transition>
          </li>
        </ul>
      </div>
    </div>
    
    <!-- Правая панель -->
    <div class="w-[60%] p-6 flex flex-col gap-4 overflow-y-auto overflow-x-hidden backdrop-blur-md bg-neutral-900/60 rounded-tl-2xl rounded-bl-2xl shadow-inner">
      <SearchResults :tab-id="activeTabId" />
    </div>
  </div>
</template>

<style scoped>
.fade-slide-enter-active, .fade-slide-leave-active {
  transition: all 0.3s ease;
}
.fade-slide-enter-from, .fade-slide-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>