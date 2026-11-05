import { getStoreApi } from '../infrastructure/desktopApi.js';

export class TasksService {
  constructor(storeAPI = getStoreApi()) { this.storeAPI = storeAPI; }
  loadTasks() { return this.storeAPI.getTasks(); }
  addTask(title, text) { return this.storeAPI.addTask(title, text); }
  updateTask(id, title, text) { return this.storeAPI.updateTask(id, title, text); }
  toggleTaskDone(id) { return this.storeAPI.toggleTaskDone(id); }
  deleteTask(id) { return this.storeAPI.deleteTask(id); }
}
