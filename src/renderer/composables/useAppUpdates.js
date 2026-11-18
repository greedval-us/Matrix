import { computed, onMounted, onUnmounted, readonly, shallowRef } from 'vue';
import { getUpdateApi } from '../infrastructure/desktopApi.js';

export function createAppUpdatesController({ getApi = getUpdateApi } = {}) {
  const state = shallowRef({ status: 'idle', currentVersion: '', release: null,
    canInstall: false, progress: 0, error: '', checkedAt: null });
  const supported = shallowRef(false);
  const loaded = shallowRef(false);
  const pendingAction = shallowRef('');
  const localError = shallowRef('');
  const message = shallowRef('');
  const dialogOpen = shallowRef(false);
  const installationFailed = shallowRef(false);
  const hasUpdate = computed(() => Boolean(state.value.release));
  const showManualDownload = computed(() => hasUpdate.value
    && (!state.value.canInstall || installationFailed.value && state.value.status === 'ready'));
  const error = computed(() => localError.value || state.value.error || '');
  const busy = computed(() => Boolean(pendingAction.value)
    || ['checking', 'downloading', 'installing'].includes(state.value.status));
  let api;
  let consumers = 0;
  let unsubscribe;
  let generation = 0;
  let revision = 0;
  let actionId = 0;

  function applyState(value) {
    if (!value || typeof value.status !== 'string') return;
    revision++;
    const previous = state.value;
    state.value = { ...state.value, ...value,
      progress: Math.min(100, Math.max(0, Number(value.progress) || 0)) };
    if (!state.value.release || previous.release?.version !== state.value.release.version
      || previous.release?.sha256 !== state.value.release.sha256
      || ['available', 'downloading', 'installing', 'idle'].includes(state.value.status)) {
      installationFailed.value = false;
    } else if (previous.status === 'installing' && state.value.status === 'ready' && state.value.error) {
      installationFailed.value = true;
    }
    localError.value = '';
    if (!state.value.release) dialogOpen.value = false;
  }

  function connect() {
    consumers++;
    if (consumers === 1) {
      const session = ++generation;
      try {
        api = getApi();
        supported.value = Boolean(api?.getState && api?.onState);
        if (!supported.value) throw new Error('Update API unavailable');
        unsubscribe = api.onState(value => {
          if (generation === session) applyState(value);
        });
        const initialRevision = revision;
        Promise.resolve(api.getState()).then(value => {
          if (generation === session && revision === initialRevision) applyState(value);
        }).catch(reason => {
          if (generation === session && revision === initialRevision) {
            localError.value = reason?.message || 'Не удалось получить сведения об обновлении.';
          }
        }).finally(() => { if (generation === session) loaded.value = true; });
      } catch {
        supported.value = false;
        loaded.value = true;
      }
    }
    let disconnected = false;
    return () => {
      if (disconnected) return;
      disconnected = true;
      if (--consumers !== 0) return;
      generation++;
      unsubscribe?.();
      unsubscribe = undefined;
      pendingAction.value = '';
    };
  }

  async function runAction(name) {
    if (!supported.value || !api) return;
    if (name === 'cancel') {
      if (state.value.status !== 'downloading' || pendingAction.value === 'cancel') return;
    } else if (busy.value) return;
    if (['download', 'saveCopy', 'install'].includes(name) && !hasUpdate.value) return;
    if (name === 'install' && (state.value.status !== 'ready' || !state.value.canInstall)) return;

    const id = ++actionId;
    const session = generation;
    const previousRevision = revision;
    pendingAction.value = name;
    if (name === 'install') installationFailed.value = false;
    localError.value = '';
    message.value = '';
    try {
      const result = await api[name]();
      if (id !== actionId || generation !== session) return;
      if (name === 'saveCopy') {
        if (result?.saved) message.value = 'Файл обновления сохранён.';
      } else if (revision === previousRevision) {
        applyState(result);
      }
    } catch (reason) {
      if (id === actionId && generation === session) {
        if (name === 'install') installationFailed.value = true;
        localError.value = reason?.message || 'Не удалось выполнить действие с обновлением.';
      }
    } finally {
      if (id === actionId && generation === session) pendingAction.value = '';
    }
  }

  const statusMessage = computed(() => {
    if (!loaded.value) return 'Получаем сведения об обновлениях…';
    if (!supported.value) return 'Проверка обновлений доступна в приложении.';
    if (state.value.status === 'installing') return 'Устанавливаем обновление и перезапускаем приложение…';
    if (state.value.status === 'downloading') return `Загрузка обновления: ${Math.round(state.value.progress)}%`;
    if (state.value.status === 'checking' || pendingAction.value === 'check') return 'Проверяем обновления…';
    if (state.value.status === 'ready') return `Версия ${state.value.release?.version || ''} готова к установке.`;
    if (hasUpdate.value) return `Доступна новая версия ${state.value.release.version}.`;
    if (error.value) return 'Не удалось проверить обновления.';
    if (state.value.checkedAt) return 'Новых версий на сервере не найдено.';
    return 'Обновления проверяются автоматически.';
  });

  return { state: readonly(state), supported: readonly(supported), loaded: readonly(loaded),
    pendingAction: readonly(pendingAction), message: readonly(message), dialogOpen: readonly(dialogOpen),
    hasUpdate, showManualDownload, error, busy, statusMessage, connect,
    check: () => runAction('check'), download: () => runAction('download'),
    cancel: () => runAction('cancel'), install: () => runAction('install'),
    saveCopy: () => runAction('saveCopy'),
    openDialog: () => { if (hasUpdate.value) dialogOpen.value = true; },
    closeDialog: () => { if (state.value.status !== 'installing') dialogOpen.value = false; },
  };
}

const appUpdates = createAppUpdatesController();

export function useAppUpdates() {
  let disconnect;
  onMounted(() => { disconnect = appUpdates.connect(); });
  onUnmounted(() => disconnect?.());
  return appUpdates;
}
