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

const searchAPI = {
  createClient: (tabId, endpoint) => ipcRenderer.invoke("search:create-client", tabId, endpoint),
  run: (tabId, payload) => ipcRenderer.invoke("search:run", tabId, payload),
  cancel: (tabId) => ipcRenderer.send("search:cancel", tabId),
  destroyClient: (tabId) => ipcRenderer.invoke("search:destroy-client", tabId),
  listDatabases: (payload) => ipcRenderer.invoke("search:list-databases", payload),
};

contextBridge.exposeInMainWorld("searchAPI", searchAPI);

contextBridge.exposeInMainWorld("databaseStorageAPI", {
  getRootPath: () => ipcRenderer.invoke("database-storage:get-root-path"),
  setRootPath: (rootPath) => ipcRenderer.invoke("database-storage:set-root-path", rootPath),
  getStatus: (rootPath) => ipcRenderer.invoke("database-storage:get-status", rootPath),
  initialize: (rootPath) => ipcRenderer.invoke("database-storage:initialize", rootPath),
});

contextBridge.exposeInMainWorld("importAPI", {
  getLastStatus: () => ipcRenderer.invoke("import:get-last-status"),
  runFolder: (folderPath) => ipcRenderer.invoke("import:run-folder", folderPath),
});

contextBridge.exposeInMainWorld("indexAPI", {
  getLastStatus: () => ipcRenderer.invoke("index:get-last-status"),
  build: () => ipcRenderer.invoke("index:build"),
});

contextBridge.exposeInMainWorld("grpcAPI", {
  createSearchClient: (tabId, endpoint) => searchAPI.createClient(tabId, endpoint),
  baseSearch: (tabId, payload) => searchAPI.run(tabId, payload),
  cancelSearch: (tabId) => searchAPI.cancel(tabId),
  destroySearchClient: (tabId) => searchAPI.destroyClient(tabId),
  databaseAll: (payload) => searchAPI.listDatabases(payload),
});
