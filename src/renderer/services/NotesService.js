export class NotesService {
  constructor(storeAPI) {
    this.storeAPI = storeAPI
    this.notes = []
    this.isLoading = false
  }

  async loadNotes() {
    this.isLoading = true
    this.notes = await this.storeAPI.getNotes()
    this.isLoading = false
  }

  async addNote(text) {
    const note = await this.storeAPI.addNote(text)
    this.notes.push(note)
    return note
  }

  async updateNote(id, text) {
    await this.storeAPI.updateNote(id, text)
    const index = this.notes.findIndex(n => n.id === id)
    if (index !== -1) this.notes[index].text = text
  }

  async deleteNote(id) {
    await this.storeAPI.deleteNote(id)
    this.notes = this.notes.filter(n => n.id !== id)
  }

  clear() {
    this.notes = []
  }
}
