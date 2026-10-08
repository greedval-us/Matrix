import { IPC_CHANNELS as channels } from "./constants/ipcChannels.js";

// Keep the bridge restricted to named operations. Electron events never cross it.
export function createPreloadApis(ipcRenderer) {
  const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
  return {
    fileDialog: {
      openFile: () => invoke(channels.dialog.openFile),
      openCertificate: () => invoke(channels.dialog.openCertificate),
      openFolder: () => invoke(channels.dialog.openFolder),
    },
    fileAPI: {
      saveDialog: (defaultName, filters) => invoke(channels.dialog.saveFile, { defaultName, filters }),
      read: (filePath) => invoke(channels.file.read, filePath),
      write: (filePath, data, isBinary = false) => invoke(channels.file.write, { filePath, data, isBinary }),
    },
    storeAPI: {
      get: (key) => invoke(channels.store.get, key),
      set: (key, value) => invoke(channels.store.set, { key, value }),
      delete: (key) => invoke(channels.store.delete, key),
      has: (key) => invoke(channels.store.has, key),
      clear: () => invoke(channels.store.clear),
      getNotes: () => invoke(channels.store.notes.get),
      addNote: (text) => invoke(channels.store.notes.add, text),
      updateNote: (id, text) => invoke(channels.store.notes.update, { id, text }),
      deleteNote: (id) => invoke(channels.store.notes.delete, id),
      getTasks: () => invoke(channels.store.tasks.get),
      addTask: (title, text) => invoke(channels.store.tasks.add, { title, text }),
      updateTask: (id, title, text) => invoke(channels.store.tasks.update, { id, title, text }),
      toggleTaskDone: (id) => invoke(channels.store.tasks.toggle, id),
      deleteTask: (id) => invoke(channels.store.tasks.delete, id),
      getHistory: () => invoke(channels.store.history.get),
      addHistoryItem: (key, value) => invoke(channels.store.history.add, { key, value }),
      deleteHistoryItem: (id) => invoke(channels.store.history.delete, id),
      clearHistory: () => invoke(channels.store.history.clear),
    },
    searchAPI: {
      createClient: (tabId) => invoke(channels.search.createClient, tabId),
      run: (tabId, payload) => invoke(channels.search.run, tabId, payload),
      cancel: (tabId) => ipcRenderer.send(channels.search.cancel, tabId),
      destroyClient: (tabId) => invoke(channels.search.destroyClient, tabId),
      listDatabases: (payload) => invoke(channels.search.listDatabases, payload),
      getConfig: () => invoke(channels.search.getConfig),
      setConfig: (config) => invoke(channels.search.setConfig, config),
      testConnection: (config) => invoke(channels.search.testConnection, config),
      getIndexStatus: () => invoke(channels.search.getIndexStatus),
      onProgress(callback) {
        const listener = (_event, payload) => callback(payload);
        ipcRenderer.on(channels.search.progress, listener);
        return () => ipcRenderer.removeListener(channels.search.progress, listener);
      },
    },
  };
}
