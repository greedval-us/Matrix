import { computed, onMounted, onBeforeUnmount, reactive } from 'vue';
import { RecordsService } from '../services/RecordsService.js';
import { createRecordsState, createRecordsWorkflow } from '../services/records/recordsWorkflow.js';

export function useRecordsTable({ service = new RecordsService() } = {}) {
  const state = reactive(createRecordsState());
  const actions = createRecordsWorkflow({ state, service });
  const available = computed(() => state.capabilities.available && state.capabilities.list);
  const busy = computed(() => state.loading || state.connecting);
  onMounted(actions.initialize);
  onBeforeUnmount(actions.dispose);
  return { state, available, busy, ...actions };
}
