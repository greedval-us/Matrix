import { reactive, readonly } from 'vue';

// Loading reflects all in-flight actions, including concurrent history writes.
export function usePendingOperations(initialState) {
  const state = reactive({ ...initialState, isLoading: false });
  let pending = 0;

  async function run(operation) {
    pending += 1;
    state.isLoading = true;
    try {
      return await operation();
    } finally {
      pending -= 1;
      state.isLoading = pending > 0;
    }
  }

  return { state, publicState: readonly(state), run };
}
