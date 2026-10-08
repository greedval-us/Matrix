export const IPC_CHANNELS = Object.freeze({
  dialog: Object.freeze({ openFile: "dialog:openFile", openCertificate: "dialog:openCertificate", openFolder: "dialog:openFolder", saveFile: "dialog:saveFile" }),
  file: Object.freeze({ read: "file:read", write: "file:write" }),
  store: Object.freeze({
    get: "store:get", set: "store:set", delete: "store:delete", has: "store:has", clear: "store:clear",
    notes: Object.freeze({ get: "store:notes:get", add: "store:notes:add", update: "store:notes:update", delete: "store:notes:delete" }),
    tasks: Object.freeze({ get: "store:tasks:get", add: "store:tasks:add", update: "store:tasks:update", toggle: "store:tasks:toggle", delete: "store:tasks:delete" }),
    history: Object.freeze({ get: "store:history:get", add: "store:history:add", delete: "store:history:delete", clear: "store:history:clear" }),
  }),
  search: Object.freeze({
    createClient: "search:create-client", run: "search:run", cancel: "search:cancel", destroyClient: "search:destroy-client",
    listDatabases: "search:list-databases", getConfig: "search:get-config", setConfig: "search:set-config",
    testConnection: "search:test-connection", getIndexStatus: "search:get-index-status", progress: "search:progress",
  }),
});
