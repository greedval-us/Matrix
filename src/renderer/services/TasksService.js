export class TasksService {
  constructor(storeAPI) {
    this.storeAPI = storeAPI
    this.tasks = []
    this.isLoading = false
  }

  async loadTasks() {
    this.isLoading = true
    this.tasks = await this.storeAPI.getTasks()
    this.isLoading = false
  }

  async addTask(title, text) {
    const task = await this.storeAPI.addTask(title, text)
    this.tasks.push(task)
    return task
  }

  async updateTask(id, title, text) {
    await this.storeAPI.updateTask(id, title, text)
    const index = this.tasks.findIndex(t => t.id === id)
    if (index !== -1) {
      this.tasks[index].title = title
      this.tasks[index].text = text
    }
  }

  async toggleTaskDone(id) {
    await this.storeAPI.toggleTaskDone(id)
    const task = this.tasks.find(t => t.id === id)
    if (task) task.done = !task.done
  }

  async deleteTask(id) {
    await this.storeAPI.deleteTask(id)
    this.tasks = this.tasks.filter(t => t.id !== id)
  }

  clear() {
    this.tasks = []
  }
}
