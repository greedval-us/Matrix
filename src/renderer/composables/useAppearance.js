import { computed, readonly, shallowRef } from 'vue';

const APPEARANCE_STORAGE_KEY = 'matrix:appearance';
const appearance = shallowRef('light');
const isDark = computed(() => appearance.value === 'dark');

function applyAppearance(value) {
  appearance.value = value === 'dark' ? 'dark' : 'light';
  const root = globalThis.document?.documentElement;
  if (root) {
    root.dataset.appearance = appearance.value;
    root.classList.toggle('dark', isDark.value);
  }
}

export function initializeAppearance() {
  let stored;
  try { stored = globalThis.localStorage?.getItem(APPEARANCE_STORAGE_KEY); } catch {}
  applyAppearance(stored);
}

function toggleAppearance() {
  applyAppearance(isDark.value ? 'light' : 'dark');
  try { globalThis.localStorage?.setItem(APPEARANCE_STORAGE_KEY, appearance.value); } catch {}
}

export function useAppearance() {
  return { appearance: readonly(appearance), isDark, toggleAppearance };
}
