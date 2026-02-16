export class TabService {
  constructor() {
    this.tabs = [{ id: Date.now(), title: 'вкладка', key: Date.now() }]
    this.activeTabId = this.tabs[0].id
    this.editingTabId = null
    this.editTitle = ''
  }

  addTab() {
    const newTab = { id: Date.now(), title: 'вкладка', key: Date.now() }
    this.tabs.push(newTab)
    this.activeTabId = newTab.id
    return newTab
  }

  closeTab(id) {
    if (this.tabs.length <= 1) return
    const index = this.tabs.findIndex(t => t.id === id)
    if (index === -1) return
    this.tabs.splice(index, 1)
    if (this.activeTabId === id) {
      this.activeTabId = this.tabs[Math.max(0, index - 1)].id
    }
  }

  setActive(id) {
    this.activeTabId = id
  }

  startEdit(tab) {
    this.editingTabId = tab.id
    this.editTitle = tab.title
  }

  finishEdit(tab) {
    const t = this.tabs.find(t => t.id === tab.id)
    if (t) t.title = this.editTitle || t.title
    this.editingTabId = null
    this.editTitle = ''
  }
}
