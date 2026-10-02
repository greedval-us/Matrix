<script setup>
import { computed, onMounted, ref } from 'vue';
import { ShieldCheck, Wifi, RefreshCw, Check } from 'lucide-vue-next';
import PageHeading from '../components/ui/PageHeading.vue';
const config = ref({
  endpoint: 'arm-5:50051',
  apiKey: '',
  caCertificatePath: '',
  bundledCertificatePath: '',
  pageSize: 1000,
  connectionTimeoutMs: 10000,
  hasApiKey: false,
});
const indexStatus = ref(null);
const loading = ref(true);
const saving = ref(false);
const testing = ref(false);
const message = ref('');
const error = ref('');
const busy = computed(() => loading.value || saving.value || testing.value);
const certificateLabel = computed(
  () => config.value.caCertificatePath || 'Встроенный сертификат сервера',
);
function draftConfig() {
  const { endpoint, apiKey, caCertificatePath, pageSize, connectionTimeoutMs } = config.value;
  return { endpoint, apiKey, caCertificatePath, pageSize, connectionTimeoutMs };
}
function applyConfig(value) {
  config.value = { ...config.value, ...value, apiKey: '' };
}
async function loadConfig() {
  try {
    applyConfig(await window.searchAPI.getConfig());
  } catch (reason) {
    error.value = reason?.message || String(reason);
  } finally {
    loading.value = false;
  }
}
async function chooseCertificate() {
  try {
    const selected = await window.fileDialog.openCertificate();
    if (selected) config.value.caCertificatePath = selected;
  } catch (reason) {
    error.value = reason?.message || String(reason);
  }
}
async function saveConfig() {
  if (busy.value) return;
  saving.value = true;
  message.value = '';
  error.value = '';
  indexStatus.value = null;
  try {
    applyConfig(await window.searchAPI.setConfig(draftConfig()));
    message.value = 'Настройки подключения сохранены';
  } catch (reason) {
    error.value = reason?.message || String(reason);
  } finally {
    saving.value = false;
  }
}
async function testConnection() {
  if (busy.value) return;
  testing.value = true;
  message.value = '';
  error.value = '';
  indexStatus.value = null;
  try {
    indexStatus.value = await window.searchAPI.testConnection(draftConfig());
    message.value = 'Соединение с сервером установлено';
  } catch (reason) {
    error.value = reason?.message || String(reason);
  } finally {
    testing.value = false;
  }
}
onMounted(loadConfig);
</script>

<template>
  <div class="mx-page mx-auto max-w-4xl">
    <PageHeading
      title="Настройки подключения"
      description="Укажите сервер и ключ доступа, затем проверьте соединение."
    />
    <p v-if="loading" role="status" class="mb-4 text-sm text-matrix-muted">Загружаем настройки…</p>
    <form class="mx-panel space-y-6 p-5 md:p-7" @submit.prevent="saveConfig">
      <fieldset :disabled="busy" class="grid gap-6 sm:grid-cols-2">
        <label class="space-y-2 text-sm"
          ><span class="block font-medium text-matrix-secondary">Адрес сервера</span
          ><input
            v-model.trim="config.endpoint"
            required
            placeholder="arm-5:50051"
            class="mx-input"
            autocomplete="off"
          /><span class="block leading-5 text-matrix-muted"
            >Имя сервера или IP-адрес и порт.</span
          ></label
        >
        <label class="space-y-2 text-sm"
          ><span class="block font-medium text-matrix-secondary"
            >API-ключ
            <span v-if="config.hasApiKey" class="ml-2 text-matrix-accent">Сохранён</span></span
          ><input
            v-model="config.apiKey"
            type="password"
            autocomplete="off"
            :placeholder="
              config.hasApiKey ? 'Оставьте пустым, чтобы сохранить ключ' : 'Введите ключ доступа'
            "
            class="mx-input"
        /></label>
        <div class="space-y-3 sm:col-span-2">
          <div class="flex items-center gap-2 text-sm font-medium text-matrix-secondary">
            <ShieldCheck aria-hidden="true" class="h-4 w-4 text-matrix-accent" />Защищённое
            соединение
          </div>
          <div class="mx-input break-all text-sm text-matrix-muted">{{ certificateLabel }}</div>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="mx-button !py-2 text-sm" @click="chooseCertificate">
              Выбрать сертификат</button
            ><button
              type="button"
              class="mx-button !py-2 text-sm"
              :disabled="!config.caCertificatePath"
              @click="config.caCertificatePath = ''"
            >
              Использовать встроенный
            </button>
          </div>
        </div>
        <details class="border-t border-matrix-border pt-5 sm:col-span-2">
          <summary class="cursor-pointer text-sm font-medium text-matrix-muted">
            Дополнительные параметры
          </summary>
          <div class="mt-5 grid gap-5 sm:grid-cols-2">
            <label class="space-y-2 text-sm"
              ><span class="block text-matrix-secondary">Записей в одной странице потока</span
              ><input
                v-model.number="config.pageSize"
                type="number"
                min="50"
                max="10000"
                required
                class="mx-input"
              /><span class="block leading-5 text-matrix-muted"
                >Сервер передаст все совпадения. Этот параметр определяет размер одной
                страницы.</span
              ></label
            ><label class="space-y-2 text-sm"
              ><span class="block text-matrix-secondary">Время ожидания подключения, мс</span
              ><input
                v-model.number="config.connectionTimeoutMs"
                type="number"
                min="1000"
                max="120000"
                step="1000"
                required
                class="mx-input"
            /></label>
          </div>
        </details>
      </fieldset>
      <div class="flex flex-wrap gap-3 border-t border-matrix-border pt-5">
        <button type="submit" :disabled="busy" class="mx-button mx-button-primary">
          <Check aria-hidden="true" class="h-4 w-4" />{{
            saving ? 'Сохранение…' : 'Сохранить настройки'
          }}</button
        ><button type="button" :disabled="busy" class="mx-button" @click="testConnection">
          <RefreshCw aria-hidden="true" v-if="testing" class="h-4 w-4 animate-spin" /><Wifi
            aria-hidden="true"
            v-else
            class="h-4 w-4"
          />{{ testing ? 'Подключаемся…' : 'Проверить соединение' }}
        </button>
      </div>
    </form>
    <p v-if="message" role="status" class="mx-alert mx-success mt-5 text-sm">{{ message }}</p>
    <p v-if="error" role="alert" class="mx-alert mt-5 text-sm">{{ error }}</p>
    <div v-if="indexStatus" class="mx-panel mt-5 p-5">
      <p class="text-sm font-medium text-matrix-text">
        Состояние индекса: {{ indexStatus.status }}
      </p>
      <p class="mt-2 text-sm text-matrix-muted">
        Доступно частей: {{ indexStatus.indexed_shards }} из {{ indexStatus.total_shards }} ·
        {{ Number(indexStatus.progress_percent || 0).toFixed(1) }}%
      </p>
    </div>
  </div>
</template>
