import { getReportSeedQuery } from '../../../shared/utils/reportIdentifiers.js';

export function createReportTabState() {
  return {
    loading: false, stopping: false, error: '', report: null,
    progress: null, saving: false, notice: '',
  };
}

// The store owns reactivity; this workflow owns report jobs and late-response guards.
export function createReportTabWorkflow({ states, createState, getTab, getQuery,
  isSearchLoading, createService, saveReport }) {
  const jobs = new Map();
  const getState = id => states[id] || null;
  const isRunning = id => jobs.has(id);

  function canCollect(id) {
    try { return Object.keys(getReportSeedQuery(getQuery(id))).length > 0; }
    catch { return false; }
  }

  function cancel(id) {
    const job = jobs.get(id);
    if (!job) return;
    const state = states[id];
    if (state) state.stopping = true;
    job.cancel();
  }

  async function collect(id) {
    if (!getTab(id) || isRunning(id) || isSearchLoading(id) || states[id]?.saving) return;
    const state = createState();
    states[id] = state;
    let seedQuery;
    try {
      seedQuery = { ...getQuery(id) };
      getReportSeedQuery(seedQuery);
    } catch {
      state.error = 'Для отчёта укажите точный идентификатор: телефон, паспорт, СНИЛС или другой тип данных. ФИО, дата рождения и маски не используются.';
      return;
    }
    const service = createService();
    jobs.set(id, service);
    state.loading = true;
    const isCurrent = () => getTab(id) && states[id] === state && jobs.get(id) === service;
    try {
      const report = await service.collect({ seedQuery, onProgress(progress) {
        if (isCurrent()) state.progress = progress;
      } });
      if (isCurrent()) state.report = report;
    } catch (error) {
      if (isCurrent()) state.error = error?.message || 'Не удалось собрать отчёт';
    } finally {
      if (isCurrent()) { state.loading = false; state.stopping = false; }
      if (jobs.get(id) === service) jobs.delete(id);
    }
  }

  async function save(id) {
    const state = states[id];
    if (!state?.report || state.loading || state.saving) return;
    const snapshot = state.report;
    state.saving = true;
    state.error = '';
    state.notice = '';
    try {
      const result = await saveReport(snapshot);
      if (states[id] === state && state.report === snapshot && result?.saved && !result.cancelled)
        state.notice = 'Отчёт DOCX сохранён.';
    } catch (error) {
      if (states[id] === state) state.error = error?.message || 'Не удалось сохранить отчёт';
    } finally {
      if (states[id] === state) state.saving = false;
    }
  }

  function clear(id) {
    cancel(id);
    jobs.delete(id);
    delete states[id];
  }

  return { getState, isRunning, canCollect, collect, cancel, save, clear };
}
