<script setup>
import { computed } from 'vue';
import { Database, Bookmark, Check, Copy } from 'lucide-vue-next';
import { SOURCE_AVAILABLE_TRUST, formatResultCount } from '../../constants/resultPresentation.js';
import { nonEmptyResultFields } from '../../../shared/utils/resultFields.js';

const props = defineProps({
  base: { type: Object, required: true },
  active: Boolean,
  saved: Boolean,
  saving: Boolean,
  copied: { type: String, default: '' },
  start: { type: Number, default: 0 },
  end: Number,
  expanded: Boolean,
  fieldLabel: { type: Function, required: true },
});
const emit = defineEmits(['save', 'copy', 'toggle-details']);
const first = computed(() => props.start === 0);
const last = computed(() => props.end === undefined || props.end === props.base.data.length);
const visibleData = computed(() => props.base.data.slice(props.start, props.end)
  .map(nonEmptyResultFields));

function toggleDetails(event) {
  if (event.currentTarget.open !== props.expanded) emit('toggle-details', event.currentTarget.open);
}
</script>

<template>
  <component
    :is="first ? 'article' : 'div'"
    :data-base-name="first ? base.name : undefined"
    :class="[
      'mx-panel search-source-card',
      { 'search-source-start': first, 'search-source-end': last },
      active ? '!border-matrix-accent/60' : '',
    ]"
  >
    <header v-if="first" class="search-source-header flex items-start justify-between gap-3 p-5 sm:px-6">
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2.5">
          <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-matrix-accent/10"
            ><Database aria-hidden="true" class="h-4 w-4 text-matrix-accent"
          /></span>
          <h3 class="break-words text-[17px] font-semibold tracking-tight">{{ base.name }}</h3>
          <span class="mx-badge">{{ formatResultCount(base.data.length) }}</span>
        </div>
        <p
          v-if="base.type_sources || base.country || base.relevance_date"
          class="mt-2 text-sm text-matrix-muted"
        >
          {{ [base.type_sources, base.country, base.relevance_date].filter(Boolean).join(' · ') }}
        </p>
      </div>
      <button
        class="mx-icon-button"
        :disabled="saving"
        :aria-label="'Сохранить источник ' + base.name + ' в заметки'"
        :title="saved ? 'Сохранено в заметки' : 'Сохранить в заметки'"
        @click="emit('save', base)"
      >
        <Check
          aria-hidden="true"
          v-if="saved"
          class="h-4 w-4 text-matrix-accent"
        /><Bookmark aria-hidden="true" v-else class="h-4 w-4" />
      </button>
    </header>
    <details
      v-if="first && (base.info || base.count || base.trust)"
      :open="expanded"
      class="search-source-details border-t border-matrix-border px-5 py-3 text-[13px] text-matrix-muted sm:px-6"
      @toggle="toggleDetails"
    >
      <summary class="cursor-pointer text-matrix-muted">Об источнике</summary>
      <p class="mt-2 whitespace-pre-wrap leading-6">{{ base.info }}</p>
      <p v-if="base.count" class="mt-1">Записей в источнике: {{ formatResultCount(base.count) }}</p>
      <p v-if="base.trust">Доступность: {{ base.trust === SOURCE_AVAILABLE_TRUST ? 'Доступна' : 'Недоступна' }}</p>
    </details>
    <div v-if="visibleData.length" :class="['divide-y divide-matrix-border', { 'border-t border-matrix-border': first }]">
      <div v-for="(fields, index) in visibleData" :key="index" class="p-5 sm:px-6 sm:py-6">
        <p class="mx-eyebrow mb-3">Запись {{ start + index + 1 }}</p>
        <dl class="mx-record grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[144px_minmax(0,1fr)]">
          <template v-for="([key, value], fieldIndex) in fields" :key="fieldIndex"
            ><dt class="pt-1.5">{{ fieldLabel(key) }}</dt>
            <dd class="group flex min-w-0 items-start gap-3 text-[15px]">
              <span class="min-w-0 flex-1 py-0.5">{{ value }}</span
              ><button
                class="mx-icon-button mx-icon-button-compact search-copy-action"
                :aria-label="'Скопировать ' + fieldLabel(key)"
                title="Скопировать значение"
                @click="emit('copy', value)"
              >
                <Check
                  aria-hidden="true"
                  v-if="copied === String(value)"
                  class="h-3.5 w-3.5 text-matrix-accent"
                /><Copy aria-hidden="true" v-else class="h-3.5 w-3.5" />
              </button></dd
          ></template>
        </dl>
      </div>
    </div>
  </component>
</template>

<style scoped>
.search-source-card { overflow: hidden; border-radius: 20px; }
.search-source-card:not(.search-source-start) { border-top-left-radius: 0; border-top-right-radius: 0; }
.search-source-card:not(.search-source-end) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; border-bottom-width: 0; }
.search-source-card:not(.search-source-start), .search-source-card:not(.search-source-end) { box-shadow: none; }
.search-source-header { background: rgb(var(--mx-raised-rgb) / 0.24); }
.search-source-details { background: rgb(var(--mx-raised-rgb) / 0.14); }
</style>
