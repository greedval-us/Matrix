<script setup>
import { ref, onMounted } from 'vue'
import { InstructionSteps } from '../../shared/constants/InstructionData'
import InstructionSection from '../components/ui/Section.vue'
import { processAndGroupMeta } from '../utils/helpers/DatabaseMetaHelper'

const activeStep = ref(0)
const yearlyUpdates = ref(null)

onMounted(async () => {
  const rawData = await window.storeAPI.get('dataMeta')
  yearlyUpdates.value = processAndGroupMeta(rawData)
})

const fadeIn = {
  enterActiveClass: 'transition-all duration-500 ease-out',
  enterFromClass: 'opacity-0 translate-y-4 scale-[0.98]',
  enterToClass: 'opacity-100 translate-y-0 scale-100',
  leaveActiveClass: 'transition-all duration-300 ease-in',
  leaveFromClass: 'opacity-100 translate-y-0 scale-100',
  leaveToClass: 'opacity-0 translate-y-4 scale-[0.98]',
}
</script>

<template>
<div class="flex h-full w-full p-4 gap-6 text-white bg-gradient-to-br from-neutral-900/80 to-neutral-950/80 backdrop-blur-xl border border-neutral-800 rounded-3xl shadow-2xl">

  <!-- Левое меню -->
  <aside class="w-64 border-r border-neutral-800 pr-3 flex flex-col gap-4 bg-neutral-900/60 rounded-xl p-3 shadow-inner backdrop-blur-md">
    <nav class="flex flex-col gap-3">
      <button
        v-for="(step, index) in InstructionSteps"
        :key="index"
        @click="activeStep = index"
        class="flex items-center gap-3 w-full text-left px-4 py-3 rounded-2xl text-sm font-semibold transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-gradient-to-r hover:from-neutral-600 hover:to-neutral-500 hover:shadow-lg"
        :class="{
          'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg scale-[1.02]': activeStep === index,
          'text-neutral-300': activeStep !== index
        }"
      >
        <component :is="step.icon" class="w-5 h-5" />
        <span class="truncate">{{ step.title }}</span>
      </button>
    </nav>
  </aside>

  <!-- Основной блок -->
  <main class="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent pr-2">
    <transition v-bind="fadeIn" mode="out-in">
      
      <!-- Обычные шаги -->
      <template v-if="InstructionSteps[activeStep] && activeStep !== 5">
        <div
          :key="activeStep"
          class="group bg-gradient-to-br from-neutral-800/70 to-neutral-900/70 p-6 rounded-3xl shadow-xl border border-neutral-700 backdrop-blur-md transition-all hover:shadow-2xl"
        >
          <InstructionSection
            :title="InstructionSteps[activeStep].title"
            :text="InstructionSteps[activeStep].text"
            :italic="InstructionSteps[activeStep].italic"
          />
        </div>
      </template>

      <!-- Обновления -->
      <template v-else-if="activeStep === 5">
        <div :key="'updates'" class="space-y-8">
          <h2 class="text-3xl font-bold tracking-tight mb-4 text-green-500 drop-shadow-md">📦 Обновления баз данных</h2>

          <div v-if="yearlyUpdates" v-for="(months, year) in yearlyUpdates" :key="year" class="mb-10">
            <h3 class="text-2xl font-semibold text-neutral-100 mb-4 border-b border-neutral-700 pb-2 drop-shadow-sm">{{ year }}</h3>

            <div v-for="(items, month) in months" :key="month" class="mb-8">
              <h4 class="text-lg font-medium text-neutral-300 mb-3 flex items-center gap-2">
                <span class="w-2 h-2 bg-neutral-500 rounded-full"></span> {{ month }}
              </h4>

              <div class="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 w-full">
                <transition-group
                  name="fade-list"
                  tag="div"
                  class="contents"
                  enter-active-class="transition-all duration-500 ease-out"
                  enter-from-class="opacity-0 translate-y-3"
                  enter-to-class="opacity-100 translate-y-0"
                >
                  <div
                    v-for="(item, idx) in items"
                    :key="item.id || idx"
                    class="group bg-gradient-to-br from-neutral-800/60 to-neutral-900/70 rounded-3xl p-5 shadow-lg border border-neutral-700/50 hover:border-green-500/50 transition-all duration-300 backdrop-blur-sm"
                  >
                    <div class="transition-transform duration-300 group-hover:scale-[1.02]">
                      <h5 class="text-base font-semibold text-neutral-100 mb-2 drop-shadow-sm">{{ item.name }}</h5>
                      <p class="text-sm text-neutral-300 leading-relaxed">
                        📂 Тип: <span class="text-neutral-200 font-medium">{{ item.type }}</span><br />
                        📅 Добавлена: <span class="text-neutral-200 font-medium">{{ item.formattedDate }}</span><br />
                        📊 Кол-во строк: <span class="text-neutral-200 font-medium">{{ item.count }}</span>
                      </p>
                    </div>
                  </div>
                </transition-group>
              </div>
            </div>
          </div>

          <div v-else class="text-neutral-400">Загрузка данных...</div>
        </div>
      </template>
    </transition>
  </main>
</div>
</template>

<style scoped>
/* Анимация для списка обновлений */
.fade-list-enter-active,
.fade-list-leave-active {
  transition: all 0.5s ease;
}
.fade-list-enter-from,
.fade-list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
