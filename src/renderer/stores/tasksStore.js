import { defineStore } from "pinia"
import { reactive, readonly } from "vue"
import { TasksService } from "../services/TasksService"

export const useTasksStore = defineStore("tasks", () => {
  const tasksService = new TasksService(window.storeAPI)

  const state = reactive({
    tasks: [],
    isLoading: false
  })

  const loadTasks = async () => {
    state.isLoading = true
    await tasksService.loadTasks()
    state.tasks = tasksService.tasks
    state.isLoading = false
  }

  const addTask = async (title, text) => {
    state.isLoading = true
    const task = await tasksService.addTask(title, text)
    state.tasks = tasksService.tasks
    state.isLoading = false
    return task
  }

  const updateTask = async (id, title, text) => {
    state.isLoading = true
    await tasksService.updateTask(id, title, text)
    state.tasks = tasksService.tasks
    state.isLoading = false
  }

  const toggleTaskDone = async (id) => {
    state.isLoading = true
    await tasksService.toggleTaskDone(id)
    state.tasks = tasksService.tasks
    loadTasks()
    state.isLoading = false
  }

  const deleteTask = async (id) => {
    state.isLoading = true
    await tasksService.deleteTask(id)
    state.tasks = tasksService.tasks
    state.isLoading = false
  }

  const clearTasks = () => {
    tasksService.clear()
    state.tasks = []
  }

  return {
    state: readonly(state),
    tasksService,
    loadTasks,
    addTask,
    updateTask,
    toggleTaskDone,
    deleteTask,
    clearTasks
  }
})
