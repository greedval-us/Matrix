<script setup>
import { computed } from 'vue';
import { Database, Bookmark, Check, Copy } from 'lucide-vue-next';
import { RESULT_PAGE_SIZE, SOURCE_AVAILABLE_TRUST, formatResultCount } from '../../constants/resultPresentation.js';

const props = defineProps({
  base: { type: Object, required: true },
  active: Boolean,
  saved: Boolean,
  saving: Boolean,
  copied: { type: String, default: '' },
  visibleCount: { type: Number, default: RESULT_PAGE_SIZE },
  fieldLabel: { type: Function, required: true },
});
const emit = defineEmits(['save', 'copy', 'showMore']);
const visibleData = computed(() => props.base.data.slice(0, props.visibleCount));
</script>

<template>
    <article
      :data-base-name="base.name"
      :class="[
        'mx-panel scroll-mt-6',
        active ? '!border-matrix-accent/60' : '',
      ]"
    >
      <header class="flex items-start justify-between gap-3 border-b border-matrix-border p-5">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-md bg-matrix-accent/10"
              ><Database aria-hidden="true" class="h-3.5 w-3.5 text-matrix-accent"
            /></span>
            <h3 class="break-words text-base font-semibold">{{ base.name }}</h3>
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
        v-if="base.info || base.count || base.trust"
        class="border-b border-matrix-border px-5 py-3 text-sm text-matrix-muted"
      >
        <summary class="cursor-pointer text-matrix-muted">Об источнике</summary>
        <p class="mt-2 whitespace-pre-wrap leading-6">{{ base.info }}</p>
        <p v-if="base.count" class="mt-1">Записей в источнике: {{ formatResultCount(base.count) }}</p>
        <p v-if="base.trust">Доступность: {{ base.trust === SOURCE_AVAILABLE_TRUST ? 'Доступна' : 'Недоступна' }}</p>
      </details>
      <div class="divide-y divide-matrix-border">
        <div v-for="(fields, index) in visibleData" :key="index" class="p-5">
          <p class="mx-eyebrow mb-3">Запись {{ index + 1 }}</p>
          <dl class="mx-record grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-[144px_minmax(0,1fr)]">
            <template v-for="([key, value], fieldIndex) in fields" :key="fieldIndex"
              ><dt class="pt-1.5">{{ fieldLabel(key) }}</dt>
              <dd class="group flex min-w-0 items-start gap-3 text-base">
                <span class="min-w-0 flex-1 py-0.5">{{ value }}</span
                ><button
                  class="mx-icon-button mx-icon-button-compact"
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
      <div
        v-if="visibleData.length < base.data.length"
        class="border-t border-matrix-border p-4"
      >
        <button
          class="mx-button w-full text-sm"
          @click="emit('showMore', base.source)"
        >
          Показать ещё {{ RESULT_PAGE_SIZE }} · {{ visibleData.length }} из {{ base.data.length }}
        </button>
      </div>
    </article>
</template>
