export class HistoryService {
  constructor(storeAPI) {
    this.storeAPI = storeAPI
    this.history = []
    this.isLoading = false
  }

  async loadHistory() {
    this.isLoading = true
    this.history = await this.storeAPI.getHistory()
    this.isLoading = false
  }

  async addHistoryItem(key, value) {
    const item = await this.storeAPI.addHistoryItem(key, value)
    this.history.unshift(item)
    return item
  }

  async deleteHistoryItem(id) {
    await this.storeAPI.deleteHistoryItem(id)
    this.history = this.history.filter(h => h.id !== id)
  }

  async clearHistory() {
    await this.storeAPI.clearHistory()
    this.history = []
  }
}
