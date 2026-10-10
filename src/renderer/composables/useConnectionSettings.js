import { computed, ref, shallowRef } from 'vue';
import { DEFAULT_SERVER_CONFIG } from '../../shared/constants/serverConfig.js';
import { getFileDialogApi, getSearchApi } from '../infrastructure/desktopApi.js';

export function useConnectionSettings({ searchAPI = getSearchApi(), fileDialog } = {}) {
  const config = ref({ ...DEFAULT_SERVER_CONFIG, apiKey: '', bundledCertificatePath: '', hasApiKey: false });
  const indexStatus = shallowRef(null);
  const loading = shallowRef(true);
  const saving = shallowRef(false);
  const testing = shallowRef(false);
  const message = shallowRef('');
  const error = shallowRef('');
  const busy = computed(() => loading.value || saving.value || testing.value);
  const certificateLabel = computed(() => config.value.caCertificatePath || 'Встроенный сертификат сервера');

  function draftConfig() {
    const { endpoint, apiKey, caCertificatePath, pageSize, connectionTimeoutMs } = config.value;
    return { endpoint, apiKey, caCertificatePath, pageSize, connectionTimeoutMs };
  }

  function applyConfig(value) {
    config.value = { ...config.value, ...value, apiKey: '' };
  }

  function showError(reason) {
    error.value = reason?.message || String(reason);
  }

  async function loadConfig() {
    try {
      applyConfig(await searchAPI.getConfig());
    } catch (reason) {
      showError(reason);
    } finally {
      loading.value = false;
    }
  }

  async function chooseCertificate() {
    if (busy.value) return;
    try {
      const selected = await (fileDialog || getFileDialogApi()).openCertificate();
      if (selected) config.value.caCertificatePath = selected;
    } catch (reason) {
      showError(reason);
    }
  }

  function beginAction(flag) {
    flag.value = true;
    message.value = '';
    error.value = '';
    indexStatus.value = null;
  }

  async function saveConfig() {
    if (busy.value) return;
    beginAction(saving);
    try {
      applyConfig(await searchAPI.setConfig(draftConfig()));
      message.value = 'Настройки подключения сохранены';
    } catch (reason) {
      showError(reason);
    } finally {
      saving.value = false;
    }
  }

  async function testConnection() {
    if (busy.value) return;
    beginAction(testing);
    try {
      indexStatus.value = await searchAPI.testConnection(draftConfig());
      message.value = 'Соединение с сервером установлено';
    } catch (reason) {
      showError(reason);
    } finally {
      testing.value = false;
    }
  }

  return { config, indexStatus, loading, saving, testing, message, error, busy,
    certificateLabel, loadConfig, chooseCertificate, saveConfig, testConnection };
}
