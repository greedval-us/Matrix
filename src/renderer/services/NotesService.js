import { getStoreApi } from '../infrastructure/desktopApi.js';

// Persistence adapter. Reactive collections belong to the Pinia store.
export class NotesService {
  constructor(storeAPI = getStoreApi()) { this.storeAPI = storeAPI; }
  loadNotes() { return this.storeAPI.getNotes(); }
  addNote(text) { return this.storeAPI.addNote(text); }
  updateNote(id, text) { return this.storeAPI.updateNote(id, text); }
  deleteNote(id) { return this.storeAPI.deleteNote(id); }
}
