<script setup>
import { onMounted, ref } from "vue";
import { InstructionSteps } from "../../shared/constants/InstructionData";
import InstructionSection from "../components/ui/Section.vue";
import { processAndGroupMeta } from "../utils/helpers/DatabaseMetaHelper";

const activeStep = ref(0);
const yearlyUpdates = ref({});
const updatesLoading = ref(false);
const updatesError = ref("");

onMounted(async () => {
  await loadUpdates();
});

async function loadUpdates() {
  updatesLoading.value = true;
  updatesError.value = "";

  try {
    const rows = await window.searchAPI.listDatabases({ request: "local-updates" });
    yearlyUpdates.value = processAndGroupMeta(rows);
  } catch (error) {
    updatesError.value = error?.message || "Не удалось загрузить обновления баз";
    yearlyUpdates.value = {};
  } finally {
    updatesLoading.value = false;
  }
}

const fadeIn = {
  enterActiveClass: "transition-all duration-500 ease-out",
  enterFromClass: "opacity-0 translate-y-4 scale-[0.98]",
  enterToClass: "opacity-100 translate-y-0 scale-100",
  leaveActiveClass: "transition-all duration-300 ease-in",
  leaveFromClass: "opacity-100 translate-y-0 scale-100",
  leaveToClass: "opacity-0 translate-y-4 scale-[0.98]",
};
</script>

<template>
  <div
    class="flex h-full w-full gap-6 rounded-3xl border border-neutral-800 bg-gradient-to-br from-neutral-900/80 to-neutral-950/80 p-4 text-white shadow-2xl backdrop-blur-xl"
  >
    <aside
      class="flex w-64 flex-col gap-4 rounded-xl border-r border-neutral-800 bg-neutral-900/60 p-3 pr-3 shadow-inner backdrop-blur-md"
    >
      <nav class="flex flex-col gap-3">
        <button
          v-for="(step, index) in InstructionSteps"
          :key="index"
          @click="activeStep = index"
          class="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition-all duration-300 ease-out hover:scale-[1.02] hover:bg-gradient-to-r hover:from-neutral-600 hover:to-neutral-500 hover:shadow-lg"
          :class="{
            'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg scale-[1.02]':
              activeStep === index,
            'text-neutral-300': activeStep !== index,
          }"
        >
          <component :is="step.icon" class="h-5 w-5" />
          <span class="truncate">{{ step.title }}</span>
        </button>
      </nav>
    </aside>

    <main
      class="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-neutral-700"
    >
      <transition v-bind="fadeIn" mode="out-in">
        <template v-if="InstructionSteps[activeStep] && activeStep !== 5">
          <div
            :key="activeStep"
            class="group rounded-3xl border border-neutral-700 bg-gradient-to-br from-neutral-800/70 to-neutral-900/70 p-6 shadow-xl backdrop-blur-md transition-all hover:shadow-2xl"
          >
            <InstructionSection
              :title="InstructionSteps[activeStep].title"
              :text="InstructionSteps[activeStep].text"
              :italic="InstructionSteps[activeStep].italic"
            />
          </div>
        </template>

        <template v-else-if="activeStep === 5">
          <div :key="'updates'" class="space-y-8">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2 class="mb-4 text-3xl font-bold tracking-tight text-green-500 drop-shadow-md">
                Обновления баз данных
              </h2>
              <button
                @click="loadUpdates"
                :disabled="updatesLoading"
                class="rounded-2xl bg-neutral-800 px-4 py-2 text-sm font-semibold text-white transition hover:bg-neutral-700 disabled:opacity-50"
              >
                {{ updatesLoading ? "Загрузка..." : "Обновить" }}
              </button>
            </div>

            <div
              v-if="updatesError"
              class="rounded-2xl border border-red-500 bg-red-900/20 px-4 py-3 text-sm text-red-300"
            >
              {{ updatesError }}
            </div>

            <template v-else-if="Object.keys(yearlyUpdates).length > 0">
              <div v-for="(months, year) in yearlyUpdates" :key="year" class="mb-10">
                <h3
                  class="mb-4 border-b border-neutral-700 pb-2 text-2xl font-semibold text-neutral-100 drop-shadow-sm"
                >
                  {{ year }}
                </h3>

                <div v-for="(items, month) in months" :key="month" class="mb-8">
                  <h4 class="mb-3 flex items-center gap-2 text-lg font-medium text-neutral-300">
                    <span class="h-2 w-2 rounded-full bg-neutral-500" />
                    {{ month }}
                  </h4>

                  <div class="grid w-full gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3">
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
                        class="group rounded-3xl border border-neutral-700/50 bg-gradient-to-br from-neutral-800/60 to-neutral-900/70 p-5 shadow-lg transition-all duration-300 backdrop-blur-sm hover:border-green-500/50"
                      >
                        <div class="transition-transform duration-300 group-hover:scale-[1.02]">
                          <h5 class="mb-2 text-base font-semibold text-neutral-100 drop-shadow-sm">
                            {{ item.name }}
                          </h5>
                          <p class="text-sm leading-relaxed text-neutral-300">
                            Тип:
                            <span class="font-medium text-neutral-200">{{ item.type }}</span>
                            <br />
                            Добавлена:
                            <span class="font-medium text-neutral-200">{{ item.formattedDate }}</span>
                            <br />
                            Кол-во строк:
                            <span class="font-medium text-neutral-200">{{ item.count }}</span>
                          </p>
                        </div>
                      </div>
                    </transition-group>
                  </div>
                </div>
              </div>
            </template>

            <div v-else class="text-neutral-400">
              {{ updatesLoading ? "Загрузка данных..." : "Данных об обновлениях пока нет" }}
            </div>
          </div>
        </template>
      </transition>
    </main>
  </div>
</template>

<style scoped>
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
