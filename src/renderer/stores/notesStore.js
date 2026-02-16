import { defineStore } from "pinia"
import { reactive, readonly } from "vue"
import { NotesService } from "../services/NotesService"

export const useNotesStore = defineStore("notes", () => {
  const notesService = new NotesService(window.storeAPI)

  const state = reactive({
    notes: [],
    isLoading: false,
  })

  const loadNotes = async () => {
    state.isLoading = true
    await notesService.loadNotes()
    state.notes = notesService.notes
    state.isLoading = false
  }

  const addNote = async (text) => {
    state.isLoading = true
    const note = await notesService.addNote(text)
    state.notes = notesService.notes
    state.isLoading = false
    return note
  }

  const updateNote = async (id, text) => {
    state.isLoading = true
    await notesService.updateNote(id, text)
    state.notes = notesService.notes
    state.isLoading = false
  }

  const deleteNote = async (id) => {
    state.isLoading = true
    await notesService.deleteNote(id)
    state.notes = notesService.notes
    state.isLoading = false
  }

  const clearNotes = () => {
    notesService.clear()
    state.notes = []
  }

  return {
    state: readonly(state),
    notesService,
    loadNotes,
    addNote,
    updateNote,
    deleteNote,
    clearNotes,
  }
})
