export const RENDERER_COLLECTION_KEYS = Object.freeze(["notes", "tasks", "history"]);

export function assertRendererStoreKey(key) {
  if (!RENDERER_COLLECTION_KEYS.includes(key)) {
    throw new Error("Ключ хранилища недоступен для интерфейса");
  }
  return key;
}
