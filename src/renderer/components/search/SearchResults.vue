<script setup>
import { computed, ref, watch } from 'vue';
import {
  Search,
  Database,
  Bookmark,
  LoaderCircle,
  ArrowUpRight,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-vue-next';
import { useTabStore } from '../../stores/tabStore';
import { useSearchUIStore } from '../../stores/uistore/serchStoreUI';
import { iconsSerchs } from '../../../shared/constants/searchItems';
import {
  groupSearchResults,
  getSearchSuggestions,
  buildResultNote,
} from '../../utils/searchResults';

const props = defineProps({ tabId: { type: Number, required: true } });
const searchUI = useSearchUIStore();
const tabStore = useTabStore();
const searchableTypes = new Set(iconsSerchs.map((item) => item.type));
const results = computed(() => searchUI.getResults(props.tabId));
const loading = computed(() => searchUI.getLoading(props.tabId));
const error = computed(() => searchUI.getError(props.tabId));
const meta = computed(() => searchUI.getMeta(props.tabId));
const received = computed(() => searchUI.getReceived(props.tabId));
const hasSearched = computed(() => tabStore.getSearchState(props.tabId)?.hasSearched);
const bases = computed(() => groupSearchResults(results.value));
const recordCount = computed(() =>
  bases.value.reduce((count, base) => count + base.data.length, 0),
);
const suggestions = computed(() =>
  getSearchSuggestions(results.value, searchUI.getSelectedFields(props.tabId), searchableTypes),
);
const visibleCounts = ref({});
const notice = ref('');
const copied = ref('');
const savedSources = ref(new Set());
const savingSources = ref(new Set());

watch(
  () => results.value,
  () => {
    visibleCounts.value = {};
    savedSources.value = new Set();
    notice.value = '';
  },
);
const formatCount = (value) => Number(value || 0).toLocaleString('ru-RU');
const visibleData = (base) => base.data.slice(0, visibleCounts.value[base.source] || 50);

function searchRelated(preload) {
  searchUI.quickSearch(tabStore.addTab(), preload);
}
async function copyValue(value) {
  notice.value = '';
  try {
    await navigator.clipboard.writeText(String(value));
    copied.value = String(value);
  } catch {
    notice.value = 'Не удалось скопировать. Выделите значение и скопируйте вручную.';
  }
}
async function saveNote(base) {
  if (savingSources.value.has(base.source)) return;
  savingSources.value.add(base.source);
  notice.value = '';
  try {
    await window.storeAPI.addNote(buildResultNote(base, searchUI.getFieldLabel));
    savedSources.value.add(base.source);
  } catch (error) {
    notice.value = error?.message || 'Не удалось сохранить заметку';
  } finally {
    savingSources.value.delete(base.source);
  }
}
</script>

<template>
  <div class="mx-page space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="mx-eyebrow mb-1.5">Выдача сервера</p>
        <h2 class="text-2xl font-semibold tracking-tight">Результаты поиска</h2>
        <p class="mt-1.5 text-xs text-slate-500">
          {{
            hasSearched
              ? 'Записи сгруппированы по источникам. Повторы внутри источника объединены.'
              : 'Совпадения появятся здесь после отправки запроса.'
          }}
        </p>
      </div>
      <span v-if="hasSearched" class="mx-badge">{{ formatCount(bases.length) }} источников</span>
    </header>

    <div
      v-if="hasSearched"
      class="mx-panel flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4"
      role="status"
    >
      <div class="flex items-center gap-3">
        <LoaderCircle v-if="loading" class="h-4 w-4 animate-spin text-emerald-300" /><Database
          v-else
          class="h-4 w-4 text-emerald-300"
        />
        <div>
          <span class="text-xl font-semibold tabular-nums text-slate-100">{{
            formatCount(recordCount)
          }}</span
          ><span class="ml-2 text-xs text-slate-500">уникальных записей</span>
        </div>
      </div>
      <span class="text-xs text-slate-400">{{
        loading
          ? 'Получение данных…'
          : meta?.cancelled
            ? 'Поиск остановлен'
            : error
              ? 'Запрос не завершён'
              : 'Запрос завершён'
      }}</span>
      <span v-if="received" class="text-xs text-slate-500"
        >Получено от сервера: {{ formatCount(received) }}</span
      >
      <span v-if="meta?.took_ms != null" class="ml-auto text-xs tabular-nums text-slate-500"
        >{{ formatCount(meta.took_ms) }} мс</span
      >
    </div>
    <div
      v-if="meta?.partial"
      class="flex items-start gap-3 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3 text-xs leading-5 text-amber-200"
      role="status"
    >
      <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <strong>Частичная выдача</strong>
        <p class="text-amber-200/70">
          Сервер ещё обновляет индекс: готово {{ meta.indexed_shards }} из
          {{ meta.total_shards }} частей. Поиск охватывает только готовые данные.
        </p>
      </div>
    </div>
    <div v-if="error" class="mx-alert space-y-3" role="alert">
      <p>{{ error }}</p>
      <div class="flex flex-wrap gap-2">
        <button
          class="mx-button !py-1.5 text-xs"
          :disabled="loading"
          @click="searchUI.search(tabId)"
        >
          Повторить запрос</button
        ><router-link to="/settings" class="mx-button !py-1.5 text-xs"
          >Настройки сервера</router-link
        >
      </div>
    </div>
    <p v-if="notice" role="alert" class="mx-alert text-xs">{{ notice }}</p>

    <div v-if="!loading && suggestions.length" class="mx-panel p-4">
      <details>
        <summary class="cursor-pointer text-xs font-medium text-slate-300">
          Продолжить поиск по найденным данным
          <span class="ml-1 text-slate-500">· {{ suggestions.length }}</span>
        </summary>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="item in suggestions"
            :key="item.fieldKey + ':' + item.fieldValue"
            class="mx-button max-w-full !px-2.5 !py-2 text-left !text-[11px]"
            title="Поиск в новой вкладке"
            @click="searchRelated(item.preload)"
          >
            <span class="text-slate-500">{{ searchUI.getFieldLabel(item.fieldKey) }}</span
            ><span class="min-w-0 break-all">{{ item.fieldValue }}</span
            ><ArrowUpRight class="h-3 w-3 shrink-0 text-emerald-300" />
          </button>
        </div>
      </details>
    </div>

    <div
      v-if="!bases.length && !error"
      class="mx-panel flex min-h-[300px] flex-col items-center justify-center px-6 text-center"
    >
      <span
        class="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#293443] bg-[#1b2531]"
        ><LoaderCircle v-if="loading" class="h-6 w-6 animate-spin text-emerald-300" /><Search
          v-else
          class="h-6 w-6 text-emerald-300"
      /></span>
      <h3 class="text-base font-medium">
        {{
          loading
            ? 'Ищем совпадения'
            : !hasSearched
              ? 'Начните с первого запроса'
              : meta?.cancelled
                ? 'Поиск остановлен'
                : 'Совпадений не найдено'
        }}
      </h3>
      <p class="mt-2 max-w-sm text-xs leading-6 text-slate-500">
        {{
          loading
            ? 'Результаты будут появляться по мере получения.'
            : !hasSearched
              ? 'Выберите тип данных слева, заполните поле и нажмите «Найти совпадения».'
              : 'Измените параметры поиска или проверьте доступность данных на сервере.'
        }}
      </p>
    </div>

    <article
      v-for="base in bases"
      :key="base.source"
      :data-base-name="base.name"
      :class="[
        'mx-panel scroll-mt-6',
        searchUI.getActiveBase(tabId) === base.name ? '!border-emerald-300/60' : '',
      ]"
    >
      <header class="flex items-start justify-between gap-3 border-b border-[#293443] p-5">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <span class="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-300/10"
              ><Database class="h-3.5 w-3.5 text-emerald-300"
            /></span>
            <h3 class="break-words text-sm font-semibold">{{ base.name }}</h3>
            <span class="mx-badge">{{ formatCount(base.data.length) }}</span>
          </div>
          <p
            v-if="base.type_sources || base.country || base.relevance_date"
            class="mt-2 text-[11px] text-slate-500"
          >
            {{ [base.type_sources, base.country, base.relevance_date].filter(Boolean).join(' · ') }}
          </p>
        </div>
        <button
          class="mx-icon-button"
          :disabled="savingSources.has(base.source)"
          :aria-label="'Сохранить источник ' + base.name + ' в заметки'"
          :title="savedSources.has(base.source) ? 'Сохранено в заметки' : 'Сохранить в заметки'"
          @click="saveNote(base)"
        >
          <Check v-if="savedSources.has(base.source)" class="h-4 w-4 text-emerald-300" /><Bookmark
            v-else
            class="h-4 w-4"
          />
        </button>
      </header>
      <details
        v-if="base.info || base.count || base.trust"
        class="border-b border-[#293443] px-5 py-3 text-xs text-slate-400"
      >
        <summary class="cursor-pointer text-slate-500">Об источнике</summary>
        <p class="mt-2 whitespace-pre-wrap leading-6">{{ base.info }}</p>
        <p v-if="base.count" class="mt-1">Записей в источнике: {{ formatCount(base.count) }}</p>
        <p v-if="base.trust">Доступность: {{ base.trust === '1' ? 'Доступна' : 'Недоступна' }}</p>
      </details>
      <div class="divide-y divide-[#293443]">
        <div v-for="(fields, index) in visibleData(base)" :key="index" class="p-5">
          <p class="mx-eyebrow mb-3">Запись {{ index + 1 }}</p>
          <dl class="mx-record grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-[130px_minmax(0,1fr)]">
            <template v-for="([key, value], fieldIndex) in fields" :key="fieldIndex"
              ><dt class="pt-1">{{ searchUI.getFieldLabel(key) }}</dt>
              <dd class="group flex min-w-0 items-start gap-2 text-sm">
                <span class="min-w-0 flex-1 py-0.5">{{ value }}</span
                ><button
                  class="mx-icon-button !h-6 !w-6"
                  :aria-label="'Скопировать ' + searchUI.getFieldLabel(key)"
                  title="Скопировать значение"
                  @click="copyValue(value)"
                >
                  <Check v-if="copied === String(value)" class="h-3 w-3 text-emerald-300" /><Copy
                    v-else
                    class="h-3 w-3"
                  />
                </button></dd
            ></template>
          </dl>
        </div>
      </div>
      <div v-if="visibleData(base).length < base.data.length" class="border-t border-[#293443] p-4">
        <button
          class="mx-button w-full text-xs"
          @click="visibleCounts[base.source] = (visibleCounts[base.source] || 50) + 50"
        >
          Показать ещё 50 · {{ visibleData(base).length }} из {{ base.data.length }}
        </button>
      </div>
    </article>
  </div>
</template>
