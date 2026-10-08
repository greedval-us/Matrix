import electron from "electron";
import { IPC_CHANNELS as channels } from "../../shared/constants/ipcChannels.js";
import { assertRendererStoreKey, RENDERER_COLLECTION_KEYS } from "../services/rendererStorePolicy.js";
import { registerIpcHandlers } from "./registerIpcHandlers.js";
import { wrapHandler } from "../utils/ipcWrapper.js";

export class StoreHandler {
  constructor(storeService, { ipc = electron.ipcMain, wrap = wrapHandler } = {}) {
    this.storeService = storeService;
    this.ipc = ipc;
    this.wrap = wrap;
  }

  register() {
    this.unregister?.();
    const store = this.storeService;
    const collectionKey = assertRendererStoreKey;
    this.unregister = registerIpcHandlers(this.ipc, {
      [channels.store.get]: (_, key) => store.get(collectionKey(key)),
      [channels.store.set]: (_, { key, value }) => store.set(collectionKey(key), value),
      [channels.store.delete]: (_, key) => store.delete(collectionKey(key)),
      [channels.store.has]: (_, key) => store.has(collectionKey(key)),
      [channels.store.clear]: () => { for (const key of RENDERER_COLLECTION_KEYS) store.set(key, []); },
      [channels.store.notes.get]: () => store.getNotes(),
      [channels.store.notes.add]: (_, text) => store.addNote(text),
      [channels.store.notes.update]: (_, { id, text }) => store.updateNote(id, text),
      [channels.store.notes.delete]: (_, id) => store.deleteNote(id),
      [channels.store.tasks.get]: () => store.getTasks(),
      [channels.store.tasks.add]: (_, { title, text }) => store.addTask(title, text),
      [channels.store.tasks.update]: (_, { id, title, text }) => store.updateTask(id, title, text),
      [channels.store.tasks.toggle]: (_, id) => store.toggleTaskDone(id),
      [channels.store.tasks.delete]: (_, id) => store.deleteTask(id),
      [channels.store.history.get]: () => store.getHistory(),
      [channels.store.history.add]: (_, { key, value }) => store.addHistoryItem(key, value),
      [channels.store.history.delete]: (_, id) => store.deleteHistoryItem(id),
      [channels.store.history.clear]: () => store.clearHistory(),
    }, {}, this.wrap);
  }

  shutdown() { this.unregister?.(); }
}
