import { defineStore } from 'pinia';
import { TasksService } from '../services/TasksService.js';
import { usePendingOperations } from './usePendingOperations.js';

export const useTasksStore = defineStore('tasks', () => {
  const service = new TasksService();
  const { state, publicState, run } = usePendingOperations({ tasks: [] });

  const loadTasks = () => run(async () => { state.tasks = await service.loadTasks(); });
  const addTask = (title, text) => run(async () => {
    const task = await service.addTask(title, text);
    state.tasks.push(task);
    return task;
  });
  const updateTask = (id, title, text) => run(async () => {
    await service.updateTask(id, title, text);
    const task = state.tasks.find(item => item.id === id);
    if (task) {
      task.title = title ?? task.title;
      task.text = text ?? task.text;
    }
  });
  const toggleTaskDone = id => run(async () => {
    await service.toggleTaskDone(id);
    state.tasks = await service.loadTasks();
  });
  const deleteTask = id => run(async () => {
    await service.deleteTask(id);
    state.tasks = state.tasks.filter(item => item.id !== id);
  });
  const clearTasks = () => { state.tasks = []; };

  return { state: publicState, loadTasks, addTask, updateTask, toggleTaskDone, deleteTask, clearTasks };
});
