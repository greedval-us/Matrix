import { contextBridge, ipcRenderer } from "electron";
import { createPreloadApis } from "../shared/createPreloadApis.js";

for (const [name, api] of Object.entries(createPreloadApis(ipcRenderer))) {
  contextBridge.exposeInMainWorld(name, api);
}
