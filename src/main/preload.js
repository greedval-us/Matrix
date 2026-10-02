const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileDialog", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openCertificate: () => ipcRenderer.invoke("dialog:openCertificate"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
});

contextBridge.exposeInMainWorld("fileAPI", {
  saveDialog: (defaultName, filters) => ipcRenderer.invoke("dialog:saveFile", { defaultName, filters }),
  read: (filePath) => ipcRenderer.invoke("file:read", filePath),
  write: (filePath, data, isBinary = false) => ipcRenderer.invoke("file:write", { filePath, data, isBinary }),
});

contextBridge.exposeInMainWorld("storeAPI", {
  get: (key) => ipcRenderer.invoke("store:get", key),
  set: (key, value) => ipcRenderer.invoke("store:set", { key, value }),
  delete: (key) => ipcRenderer.invoke("store:delete", key),
  has: (key) => ipcRenderer.invoke("store:has", key),
  clear: () => ipcRenderer.invoke("store:clear"),

  getNotes: () => ipcRenderer.invoke("store:notes:get"),
  addNote: (text) => ipcRenderer.invoke("store:notes:add", text),
  updateNote: (id, text) => ipcRenderer.invoke("store:notes:update", { id, text }),
  deleteNote: (id) => ipcRenderer.invoke("store:notes:delete", id),

  getTasks: () => ipcRenderer.invoke("store:tasks:get"),
  addTask: (title, text) => ipcRenderer.invoke("store:tasks:add", { title, text }),
  updateTask: (id, title, text) => ipcRenderer.invoke("store:tasks:update", { id, title, text }),
  toggleTaskDone: (id) => ipcRenderer.invoke("store:tasks:toggle", id),
  deleteTask: (id) => ipcRenderer.invoke("store:tasks:delete", id),

  getHistory: () => ipcRenderer.invoke("store:history:get"),
  addHistoryItem: (key, value) => ipcRenderer.invoke("store:history:add", { key, value }),
  deleteHistoryItem: (id) => ipcRenderer.invoke("store:history:delete", id),
  clearHistory: () => ipcRenderer.invoke("store:history:clear"),
});

const searchAPI = {
  createClient: (tabId) => ipcRenderer.invoke("search:create-client", tabId),
  run: (tabId, payload) => ipcRenderer.invoke("search:run", tabId, payload),
  cancel: (tabId) => ipcRenderer.send("search:cancel", tabId),
  destroyClient: (tabId) => ipcRenderer.invoke("search:destroy-client", tabId),
  listDatabases: (payload) => ipcRenderer.invoke("search:list-databases", payload),
  getConfig: () => ipcRenderer.invoke("search:get-config"),
  setConfig: (config) => ipcRenderer.invoke("search:set-config", config),
  testConnection: (config) => ipcRenderer.invoke("search:test-connection", config),
  getIndexStatus: () => ipcRenderer.invoke("search:get-index-status"),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("search:progress", listener);
    return () => ipcRenderer.removeListener("search:progress", listener);
  },
};

contextBridge.exposeInMainWorld("searchAPI", searchAPI);
