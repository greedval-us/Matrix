import { defineStore } from 'pinia';
import { NotesService } from '../services/NotesService.js';
import { usePendingOperations } from './usePendingOperations.js';

export const useNotesStore = defineStore('notes', () => {
  const service = new NotesService();
  const { state, publicState, run } = usePendingOperations({ notes: [] });

  const loadNotes = () => run(async () => { state.notes = await service.loadNotes(); });
  const addNote = text => run(async () => {
    const note = await service.addNote(text);
    state.notes.push(note);
    return note;
  });
  const updateNote = (id, text) => run(async () => {
    await service.updateNote(id, text);
    const note = state.notes.find(item => item.id === id);
    if (note) note.text = text;
  });
  const deleteNote = id => run(async () => {
    await service.deleteNote(id);
    state.notes = state.notes.filter(item => item.id !== id);
  });
  // Clearing the view retains the existing local-only semantics.
  const clearNotes = () => { state.notes = []; };

  return { state: publicState, loadNotes, addNote, updateNote, deleteNote, clearNotes };
});
