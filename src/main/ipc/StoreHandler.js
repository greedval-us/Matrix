import { ipcMain } from "electron";
import { wrapHandler } from "../utils/ipcWrapper.js";

export class StoreHandler {
  constructor(storeService) {
    this.storeService = storeService;
  }

  register() {
    ipcMain.handle("store:get", wrapHandler("store:get", (_, key) => this.storeService.get(key)));
    ipcMain.handle("store:set", wrapHandler("store:set", (_, { key, value }) => this.storeService.set(key, value)));
    ipcMain.handle("store:delete", wrapHandler("store:delete", (_, key) => this.storeService.delete(key)));
    ipcMain.handle("store:has", wrapHandler("store:has", (_, key) => this.storeService.has(key)));
    ipcMain.handle("store:clear", wrapHandler("store:clear", () => this.storeService.clear()));

    ipcMain.handle("store:notes:get", wrapHandler("store:notes:get", () => this.storeService.getNotes()));
    ipcMain.handle("store:notes:add", wrapHandler("store:notes:add", (_, text) => this.storeService.addNote(text)));
    ipcMain.handle("store:notes:update", wrapHandler("store:notes:update", (_, { id, text }) => this.storeService.updateNote(id, text)));
    ipcMain.handle("store:notes:delete", wrapHandler("store:notes:delete", (_, id) => this.storeService.deleteNote(id)));

    ipcMain.handle("store:tasks:get", wrapHandler("store:tasks:get", () => this.storeService.getTasks()));
    ipcMain.handle(
      "store:tasks:add",
      wrapHandler("store:tasks:add", (_, { title, text }) => this.storeService.addTask(title, text))
    );
    ipcMain.handle("store:tasks:update", wrapHandler("store:tasks:update", (_, { id, title, text }) => this.storeService.updateTask(id, title, text)));
    ipcMain.handle("store:tasks:toggle", wrapHandler("store:tasks:toggle", (_, id) => this.storeService.toggleTaskDone(id)));
    ipcMain.handle("store:tasks:delete", wrapHandler("store:tasks:delete", (_, id) => this.storeService.deleteTask(id)));

    ipcMain.handle("store:history:get", wrapHandler("store:history:get", () => this.storeService.getHistory()));
    ipcMain.handle("store:history:add", wrapHandler("store:history:add", (_, { key, value }) => this.storeService.addHistoryItem(key, value)));
    ipcMain.handle("store:history:delete", wrapHandler("store:history:delete", (_, id) => this.storeService.deleteHistoryItem(id)));
    ipcMain.handle("store:history:clear", wrapHandler("store:history:clear", () => this.storeService.clearHistory()));
  }
}
