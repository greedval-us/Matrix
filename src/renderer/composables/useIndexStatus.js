import { computed, readonly, shallowRef } from 'vue';
import { getSearchApi } from '../infrastructure/desktopApi.js';

export const STATUS_POLL_INTERVAL_MS = 15_000;
export const PERCENT_COMPLETE = 100;

export function useIndexStatus({ searchAPI = getSearchApi(), scheduler = globalThis } = {}) {
  const status = shallowRef(null);
  const config = shallowRef(null);
  const loading = shallowRef(false);
  const error = shallowRef('');
  let timer;
  let active = true;
  let generation = 0;
  const progress = computed(() => {
    const value = Number(status.value?.progress_percent || 0);
    return Number.isFinite(value) ? Math.max(0, Math.min(value, PERCENT_COMPLETE)) : 0;
  });

  async function refresh() {
    if (!active || loading.value) return;
    const requestGeneration = generation;
    const isCurrent = () => active && requestGeneration === generation;
    loading.value = true;
    error.value = '';
    try {
      const nextConfig = await searchAPI.getConfig();
      if (!isCurrent()) return;
      config.value = nextConfig;
      const nextStatus = await searchAPI.getIndexStatus();
      if (isCurrent()) status.value = nextStatus;
    } catch (reason) {
      if (isCurrent()) {
        status.value = null;
        error.value = reason?.message || String(reason);
      }
    } finally {
      if (isCurrent()) loading.value = false;
    }
  }

  function start() {
    if (timer !== undefined) return;
    active = true;
    void refresh();
    timer = scheduler.setInterval(refresh, STATUS_POLL_INTERVAL_MS);
  }

  function stop() {
    active = false;
    generation += 1;
    if (timer !== undefined) scheduler.clearInterval(timer);
    timer = undefined;
    loading.value = false;
  }

  return { status: readonly(status), config: readonly(config), loading: readonly(loading),
    error: readonly(error), progress, refresh, start, stop };
}
