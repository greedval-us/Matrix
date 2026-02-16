const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("fileDialog", {
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openFolder: () => ipcRenderer.invoke("dialog:openFolder"),
});

contextBridge.exposeInMainWorld("fileAPI", {
  saveDialog: (defaultName, filters) => ipcRenderer.invoke("dialog:saveFile", { defaultName, filters }),
  read: (filePath) => ipcRenderer.invoke("file:read", filePath),
  write: (filePath, data) => ipcRenderer.invoke("file:write", { filePath, data }),
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


contextBridge.exposeInMainWorld("grpcAPI", {
  createSearchClient: (tabId, serverAddress) => ipcRenderer.invoke("grpc:create-search-client", tabId, serverAddress),
  baseSearch: (tabId, payload) => ipcRenderer.invoke("grpc:base_search", tabId, payload),
  cancelSearch: (tabId) => ipcRenderer.send("grpc:cancel-search", tabId),
  destroySearchClient: (tabId) => ipcRenderer.invoke("grpc:destroy-search-client", tabId),
  databaseAll: (payload) => ipcRenderer.invoke("grpc:database_all", payload),
});