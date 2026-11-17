<script setup>
import { computed, nextTick, onBeforeUnmount, shallowRef, useTemplateRef, watch } from 'vue';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI.js';
import SearchSourceCard from './SearchSourceCard.vue';

const WINDOW_ROWS = 36;
const SHIFT_ROWS = 18;
const BLOCK_ROWS = 6;
const props = defineProps({
  tabId: { type: Number, required: true },
  state: { type: Object, required: true },
  viewport: Object,
});
const searchUI = useSearchUIStore();
const { largeResults, activeBase, fieldLabel, copyValue, copied } = props.state;
const list = useTemplateRef('list');
const before = useTemplateRef('before');
const after = useTemplateRef('after');
const windowRows = shallowRef([]);
const start = shallowRef(0);
const expanded = shallowRef(false);
const busy = shallowRef(false);
const error = shallowRef('');
const jump = shallowRef('');
const source = computed(() => largeResults.value?.sources.find(item => item.source === activeBase.value)
  ?? largeResults.value?.sources[0]);
const blocks = computed(() => {
  if (!source.value) return [];
  const result = [];
  for (let offset = 0; offset < windowRows.value.length; offset += BLOCK_ROWS) {
    result.push({
      position: start.value + offset,
      base: { ...source.value, data: windowRows.value.slice(offset, offset + BLOCK_ROWS) },
    });
  }
  return result;
});
const beforeAvailable = computed(() => start.value > 0);
const afterAvailable = computed(() => start.value + windowRows.value.length < (source.value?.recordCount ?? 0));
let request = 0;

function visibleAnchor(direction) {
  if (!props.viewport) return null;
  const bounds = props.viewport.getBoundingClientRect();
  const cards = Array.from(list.value?.querySelectorAll('[data-position]') ?? []);
  const card = direction > 0
    ? cards.findLast(element => element.getBoundingClientRect().top < bounds.bottom)
    : cards.find(element => element.getBoundingClientRect().bottom > bounds.top);
  return card && { position: card.dataset.position, top: card.getBoundingClientRect().top };
}

async function load(nextStart, mode, direction = 0) {
  const token = largeResults.value?.token;
  const key = source.value?.source;
  if (!token || !key) return;
  const current = ++request;
  const anchor = mode === 'shift' ? visibleAnchor(direction) : null;
  busy.value = true;
  error.value = '';
  try {
    const rows = await searchUI.readLargeResults(props.tabId, token, key, nextStart, WINDOW_ROWS);
    if (current !== request) return;
    start.value = nextStart;
    windowRows.value = rows;
    await nextTick();
    if (current !== request) return;
    if (anchor && props.viewport) {
      const card = list.value?.querySelector(`[data-position="${anchor.position}"]`);
      if (card) props.viewport.scrollTop += card.getBoundingClientRect().top - anchor.top;
      else list.value?.scrollIntoView({ block: direction > 0 ? 'start' : 'end' });
    } else if (mode === 'jump') {
      list.value?.scrollIntoView({ block: 'start' });
    }
  } catch (failure) {
    if (current === request) error.value = failure?.message || 'Не удалось прочитать результаты';
  } finally {
    if (current === request) busy.value = false;
  }
}

function shift(direction) {
  if (busy.value || error.value) return;
  const nextStart = Math.max(0, start.value + direction * SHIFT_ROWS);
  if (nextStart !== start.value) void load(nextStart, 'shift', direction);
}

function jumpToRecord() {
  const position = Number(jump.value);
  if (!Number.isSafeInteger(position) || position < 1 || position > source.value.recordCount) return;
  void load(position - 1, 'jump');
}

function showSource() {
  void nextTick(() => load(0, 'jump'));
}

watch([() => largeResults.value?.token, () => source.value?.source], ([token, key]) => {
  request += 1;
  start.value = 0;
  windowRows.value = [];
  busy.value = false;
  error.value = '';
  expanded.value = false;
  jump.value = '';
  if (token && key) void load(0);
}, { immediate: true });

watch([() => source.value?.recordCount, busy], ([count, isBusy]) => {
  if (!isBusy && !error.value && windowRows.value.length < Math.min(WINDOW_ROWS, count - start.value)) {
    void load(start.value);
  }
});

watch([() => props.viewport, before, after, busy], ([viewport, previous, next, isBusy], _, cleanup) => {
  if (!viewport || isBusy || typeof IntersectionObserver !== 'function') return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      shift(entry.target === previous ? -1 : 1);
    }
  }, { root: viewport, rootMargin: '200px 0px' });
  if (previous) observer.observe(previous);
  if (next) observer.observe(next);
  cleanup(() => observer.disconnect());
}, { flush: 'post' });

defineExpose({ showSource });
onBeforeUnmount(() => { request += 1; });
</script>

<template>
  <section v-if="source" class="space-y-3" aria-label="Результаты выбранного источника">
    <form v-if="source.recordCount > WINDOW_ROWS" class="flex flex-wrap items-center gap-2"
      @submit.prevent="jumpToRecord">
      <label class="text-xs text-matrix-muted" :for="`search-row-${tabId}`">Перейти к записи</label>
      <input :id="`search-row-${tabId}`" v-model="jump" class="mx-input !w-28 !py-2 text-xs"
        type="number" inputmode="numeric" min="1" :max="source.recordCount" required />
      <button type="submit" class="mx-button !py-2 text-xs" :disabled="busy">Перейти</button>
    </form>
    <div v-if="error" class="mx-alert text-sm" role="alert">
      <p>{{ error }}</p>
      <button type="button" class="mx-button mt-2 !py-1.5 text-xs" @click="load(start)">Повторить</button>
    </div>
    <div ref="list" class="large-search-list">
      <div v-if="beforeAvailable" ref="before" class="h-2" aria-hidden="true" />
      <div v-for="{ position, base } in blocks" :key="`${source.source}:${position}`" :data-position="position"
      >
        <SearchSourceCard :base="base" :continuation="position > 0" :record-offset="position"
          :record-count="source.recordCount" :expanded="expanded" :copied="copied" :field-label="fieldLabel"
          hide-save @copy="copyValue" @toggle-details="expanded = $event" />
      </div>
      <div v-if="afterAvailable" ref="after" class="h-2" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped>
.large-search-list { overflow-anchor: none; }
</style>
