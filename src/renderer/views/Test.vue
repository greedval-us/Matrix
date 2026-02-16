<script setup>
import { ref, onMounted } from "vue"

// состояния
const selectedFile = ref(null)
const selectedFolder = ref(null)
const storeValue = ref("")
const storeKey = ref("testKey")
const storeCheck = ref("")
const keyExists = ref(null)

const fileContent = ref("")
const saveMessage = ref("")
const newTaskTitle = ref("")
const newTaskText = ref("")
// gRPC состояния
const tabId = ref("tab1")
const grpcQuery = ref("example query")
const grpcResults = ref([])
const dbResults = ref([])

// функции: FileDialog
const openFile = async () => {
  if (window.fileDialog) selectedFile.value = await window.fileDialog.openFile()
}
const openFolder = async () => {
  if (window.fileDialog) selectedFolder.value = await window.fileDialog.openFolder()
}

// функции: StoreAPI
const storeSet = async () => {
  if (window.storeAPI) await window.storeAPI.set(storeKey.value, storeValue.value)
}
const storeGet = async () => {
  if (window.storeAPI) storeCheck.value = await window.storeAPI.get(storeKey.value)
}
const storeDelete = async () => {
  if (window.storeAPI) {
    await window.storeAPI.delete(storeKey.value)
    storeCheck.value = ""
    keyExists.value = null
  }
}
const storeHas = async () => {
  if (window.storeAPI) keyExists.value = await window.storeAPI.has(storeKey.value)
}
const storeClear = async () => {
  if (window.storeAPI) {
    await window.storeAPI.clear()
    storeCheck.value = ""
    keyExists.value = null
  }
}

// функции: FileAPI
const readFile = async () => {
  if (!selectedFile.value) {
    alert("Сначала выбери файл!")
    return
  }
  fileContent.value = await window.fileAPI.read(selectedFile.value)
}
const saveFile = async () => {
  const filePath = await window.fileAPI.saveDialog("test.json")
  if (!filePath) {
    saveMessage.value = "Сохранение отменено"
    return
  }
  await window.fileAPI.write(filePath, { hello: "world", time: Date.now() })
  saveMessage.value = "Файл сохранён: " + filePath
}

// функции: gRPC API
const createClient = async () => {
  await window.grpcAPI.createSearchClient(tabId.value)
}
const runBaseSearch = async () => {
  grpcResults.value = await window.grpcAPI.baseSearch(tabId.value, { query: grpcQuery.value })
}
const cancelBaseSearch = async () => {
  window.grpcAPI.cancelSearch(tabId.value)
}
const destroyClient = async () => {
  await window.grpcAPI.destroySearchClient(tabId.value)
}
const runDatabaseAll = async () => {
  dbResults.value = await window.grpcAPI.databaseAll({ include: true })
}

// Notes
const notes = ref([])
const newNote = ref("")

const loadNotes = async () => {
  notes.value = await window.storeAPI.getNotes()
}
const addNote = async () => {
  if (!newNote.value) return
  await window.storeAPI.addNote(newNote.value)
  newNote.value = ""
  await loadNotes()
}
const updateNote = async (id, text) => {
  const newText = prompt("Новое содержимое:", text)
  if (newText) {
    await window.storeAPI.updateNote(id, newText)
    await loadNotes()
  }
}
const deleteNote = async (id) => {
  await window.storeAPI.deleteNote(id)
  await loadNotes()
}

// Tasks
const tasks = ref([])

const loadTasks = async () => {
  tasks.value = await window.storeAPI.getTasks()
}
const addTask = async () => {
  if (!newTaskTitle.value && !newTaskText.value) return
  await window.storeAPI.addTask(newTaskTitle.value, newTaskText.value)
  newTaskTitle.value = ""
  newTaskText.value = ""
  await loadTasks()
}
const toggleTask = async (id) => {
  await window.storeAPI.toggleTaskDone(id)
  await loadTasks()
}
const updateTask = async (id, title, text) => {
  const newTitle = prompt("Новое название:", title)
  const newText = prompt("Новое описание:", text)
  if (newTitle !== null && newText !== null) {
    await window.storeAPI.updateTask(id, newTitle, newText)
    await loadTasks()
  }
}
const deleteTask = async (id) => {
  await window.storeAPI.deleteTask(id)
  await loadTasks()
}

// History
const history = ref([])
const historyKey = ref("")
const historyValue = ref("")

const loadHistory = async () => {
  history.value = await window.storeAPI.getHistory()
}
const addHistory = async () => {
  if (!historyKey.value || !historyValue.value) return
  await window.storeAPI.addHistoryItem(historyKey.value, historyValue.value)
  historyKey.value = ""
  historyValue.value = ""
  await loadHistory()
}
const deleteHistoryItem = async (id) => {
  await window.storeAPI.deleteHistoryItem(id)
  await loadHistory()
}
const clearHistory = async () => {
  await window.storeAPI.clearHistory()
  await loadHistory()
}

onMounted(async () => {
  await loadNotes()
  await loadTasks()
  await loadHistory()
})
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8 bg-gray-900 min-h-screen text-gray-200">
    <h1 class="text-3xl font-bold text-center mb-6 text-white">Preload API Test</h1>

 <!-- File Dialog Section -->
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">File Dialog</h2>
      <div class="flex gap-4">
        <button @click="openFile"
                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition">
          Открыть файл
        </button>
        <button @click="openFolder"
                class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500 transition">
          Открыть папку
        </button>
      </div>
      <p>Выбранный файл: <span class="font-medium text-gray-100">{{ selectedFile || '-' }}</span></p>
      <p>Выбранная папка: <span class="font-medium text-gray-100">{{ selectedFolder || '-' }}</span></p>

      <!-- File API tests -->
      <div class="mt-4 flex gap-4">
        <button @click="readFile"
                class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition">
          Прочитать файл
        </button>
        <button @click="saveFile"
                class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 transition">
          Сохранить файл
        </button>
      </div>
      <p class="mt-2">Содержимое файла:</p>
      <pre class="bg-gray-700 p-3 rounded text-sm whitespace-pre-wrap">{{ fileContent || '-' }}</pre>
      <p v-if="saveMessage" class="text-green-400 font-semibold">{{ saveMessage }}</p>
    </section>

    <!-- Store API Section -->
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">Store API</h2>
      <div class="flex gap-4">
        <input v-model="storeKey" placeholder="Ключ"
               class="border border-gray-600 rounded px-3 py-2 flex-1 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <input v-model="storeValue" placeholder="Значение"
               class="border border-gray-600 rounded px-3 py-2 flex-1 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div class="flex flex-wrap gap-3">
        <button @click="storeSet" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition">Сохранить</button>
        <button @click="storeGet" class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition">Получить</button>
        <button @click="storeDelete" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition">Удалить</button>
        <button @click="storeHas" class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-500 transition">Проверить существование</button>
        <button @click="storeClear" class="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500 transition">Очистить все</button>
      </div>

      <p class="mt-2">Текущее значение: <span class="font-medium text-gray-100">{{ storeCheck || '-' }}</span></p>
      <p v-if="keyExists !== null">
        Ключ существует: 
        <span :class="keyExists ? 'text-green-400 font-bold' : 'text-red-400 font-bold'">
          {{ keyExists ? 'Да' : 'Нет' }}
        </span>
      </p>
    </section>
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">gRPC API</h2>

      <div class="flex gap-4">
        <input v-model="tabId" placeholder="Tab ID"
               class="border border-gray-600 rounded px-3 py-2 flex-1 bg-gray-700 text-white" />
        <input v-model="grpcQuery" placeholder="Запрос"
               class="border border-gray-600 rounded px-3 py-2 flex-1 bg-gray-700 text-white" />
      </div>

      <div class="flex flex-wrap gap-3">
        <button @click="createClient"
                class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 transition">
          Создать клиента
        </button>
        <button @click="runBaseSearch"
                class="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-500 transition">
          Поиск (BaseSearch)
        </button>
        <button @click="cancelBaseSearch"
                class="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-500 transition">
          Отменить поиск
        </button>
        <button @click="destroyClient"
                class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500 transition">
          Удалить клиента
        </button>
        <button @click="runDatabaseAll"
                class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500 transition">
          DatabaseAll
        </button>
      </div>

      <div class="mt-4">
        <h3 class="text-lg font-semibold text-gray-200">Результаты BaseSearch:</h3>
        <pre class="bg-gray-700 p-3 rounded text-sm whitespace-pre-wrap">{{ grpcResults || '-' }}</pre>
      </div>

      <div class="mt-4">
        <h3 class="text-lg font-semibold text-gray-200">Результаты DatabaseAll:</h3>
        <pre class="bg-gray-700 p-3 rounded text-sm whitespace-pre-wrap">{{ dbResults || '-' }}</pre>
      </div>
    </section>

      <!-- Notes Section -->
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">Notes</h2>
      <div class="flex gap-3">
        <input v-model="newNote" placeholder="Новая заметка"
               class="flex-1 border border-gray-600 rounded px-3 py-2 bg-gray-700 text-white focus:ring-2 focus:ring-blue-500" />
        <button @click="addNote" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">Добавить</button>
      </div>
      <ul class="space-y-2">
        <li v-for="note in notes" :key="note.id" class="flex justify-between items-center bg-gray-700 px-3 py-2 rounded">
          <span>{{ note.text }}</span>
          <div class="space-x-2">
            <button @click="updateNote(note.id, note.text)" class="px-2 py-1 bg-yellow-600 text-white rounded">✏️</button>
            <button @click="deleteNote(note.id)" class="px-2 py-1 bg-red-600 text-white rounded">🗑️</button>
          </div>
        </li>
      </ul>
    </section>

    <!-- Tasks Section -->
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">Tasks</h2>
<div class="flex gap-3">
  <input v-model="newTaskTitle" placeholder="Название задачи"
         class="flex-1 border border-gray-600 rounded px-3 py-2 bg-gray-700 text-white focus:ring-2 focus:ring-green-500" />
  <input v-model="newTaskText" placeholder="Описание задачи"
         class="flex-1 border border-gray-600 rounded px-3 py-2 bg-gray-700 text-white focus:ring-2 focus:ring-green-500" />
  <button @click="addTask" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-500">Добавить</button>
</div>

<ul class="space-y-2">
  <li v-for="task in tasks" :key="task.id" class="flex justify-between items-center bg-gray-700 px-3 py-2 rounded">
    <div>
      <span :class="task.done ? 'line-through text-gray-400' : ''" class="font-bold">{{ task.title }}</span>
      <p :class="task.done ? 'line-through text-gray-400' : ''">{{ task.text }}</p>
      <small class="text-gray-400">{{ new Date(task.createdAt).toLocaleString() }}</small>
    </div>
    <div class="space-x-2">
      <button @click="toggleTask(task.id)" class="px-2 py-1 bg-indigo-600 text-white rounded">
        {{ task.done ? '✅' : '⬜' }}
      </button>
      <button @click="updateTask(task.id, task.title, task.text)" class="px-2 py-1 bg-yellow-600 text-white rounded">✏️</button>
      <button @click="deleteTask(task.id)" class="px-2 py-1 bg-red-600 text-white rounded">🗑️</button>
    </div>
  </li>
</ul>
    </section>

    <!-- History Section -->
    <section class="bg-gray-800 shadow rounded-lg p-6 space-y-4">
      <h2 class="text-xl font-semibold text-white">History (key/value)</h2>
      <div class="flex gap-3">
        <input v-model="historyKey" placeholder="Ключ"
               class="flex-1 border border-gray-600 rounded px-3 py-2 bg-gray-700 text-white focus:ring-2 focus:ring-purple-500" />
        <input v-model="historyValue" placeholder="Значение"
               class="flex-1 border border-gray-600 rounded px-3 py-2 bg-gray-700 text-white focus:ring-2 focus:ring-purple-500" />
        <button @click="addHistory" class="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-500">Добавить</button>
        <button @click="clearHistory" class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-500">Очистить все</button>
      </div>
      <ul class="space-y-2">
        <li v-for="h in history" :key="h.id" class="flex justify-between items-center bg-gray-700 px-3 py-2 rounded">
          <span><strong>{{ h.key }}</strong>: {{ h.value }} <small class="text-gray-400">{{ new Date(h.createdAt).toLocaleString() }}</small></span>
          <button @click="deleteHistoryItem(h.id)" class="px-2 py-1 bg-red-600 text-white rounded">🗑️</button>
        </li>
      </ul>
    </section>
  </div>
</template>
