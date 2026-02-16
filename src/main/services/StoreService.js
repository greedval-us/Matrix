import Store from "electron-store";
import { randomUUID } from "crypto";

export class StoreService {
  constructor(schema = {}) {
    this.store = new Store({
      schema: {
        notes: { type: "array", default: [] },
        tasks: { type: "array", default: [] },
        history: { type: "array", default: [] },
        ...schema,
      },
    });
  }

  get(key) { return this.store.get(key); }
  set(key, value) { this.store.set(key, value); }
  delete(key) { this.store.delete(key); }
  has(key) { return this.store.has(key); }
  clear() { this.store.clear(); }

  getNotes() {
    return this.store.get("notes");
  }

  addNote(text) {
    const notes = this.getNotes();
    const note = {
      id: randomUUID(),
      text,
      createdAt: new Date().toISOString(),
    };
    notes.push(note);
    this.store.set("notes", notes);
    return note;
  }

  updateNote(id, newText) {
    let notes = this.getNotes();
    notes = notes.map(n =>
      n.id === id ? { ...n, text: newText, updatedAt: new Date().toISOString() } : n
    );
    this.store.set("notes", notes);
    return true;
  }

  deleteNote(id) {
    const notes = this.getNotes().filter(n => n.id !== id);
    this.store.set("notes", notes);
    return true;
  }

  getTasks() {
    return this.store.get("tasks");
  }

  addTask(title, text = "") {
    const tasks = this.getTasks();
    const task = {
      id: randomUUID(),
      title,
      text,
      done: false,
      createdAt: new Date().toISOString(),
    };
    tasks.push(task);
    this.store.set("tasks", tasks);
    return task;
  }

  updateTask(id, newTitle, newText) {
    let tasks = this.getTasks();
    tasks = tasks.map(t =>
      t.id === id
        ? {
            ...t,
            title: newTitle ?? t.title,
            text: newText ?? t.text,
            updatedAt: new Date().toISOString(),
          }
        : t
    );
    this.store.set("tasks", tasks);
    return true;
  }

  toggleTaskDone(id) {
    let tasks = this.getTasks();
    tasks = tasks.map(t =>
      t.id === id
        ? { ...t, done: !t.done, updatedAt: new Date().toISOString() }
        : t
    );
    this.store.set("tasks", tasks);
    return true;
  }

  deleteTask(id) {
    const tasks = this.getTasks().filter(t => t.id !== id);
    this.store.set("tasks", tasks);
    return true;
  }

  getHistory() {
    return this.store.get("history");
  }

  addHistoryItem(key, value) {
    const history = this.getHistory();
    const item = {
      id: randomUUID(),
      key,
      value,
      createdAt: new Date().toISOString(),
    };
    history.unshift(item);
    this.store.set("history", history);
    return item;
  }

  deleteHistoryItem(id) {
    const history = this.getHistory().filter(h => h.id !== id);
    this.store.set("history", history);
    return true;
  }

  clearHistory() {
    this.store.set("history", []);
    return true;
  }
}
