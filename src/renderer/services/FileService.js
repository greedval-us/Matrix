export class FileService {
  constructor(fileDialog, fileAPI) {
    this.fileDialog = fileDialog
    this.fileAPI = fileAPI
    this.currentFilePath = null
    this.currentData = null
    this.isLoading = false
  }

  async openFile() {
    this.isLoading = true
    try {
      const filePath = await this.fileDialog.openFile()
      if (!filePath) return null
      this.currentFilePath = filePath
      this.currentData = await this.fileAPI.read(filePath)
      return { filePath, data: this.currentData }
    } finally {
      this.isLoading = false
    }
  }

  async openFolder() {
    this.isLoading = true
    try {
      const folderPath = await this.fileDialog.openFolder()
      return folderPath || null
    } finally {
      this.isLoading = false
    }
  }

  async saveFile(defaultName = "newFile.txt", filters = []) {
    this.isLoading = true
    try {
      const filePath = await this.fileAPI.saveDialog(defaultName, filters)
      if (!filePath) return null
      this.currentFilePath = filePath
      return filePath
    } finally {
      this.isLoading = false
    }
  }

  async readFile(filePath = this.currentFilePath) {
    if (!filePath) throw new Error("Нет пути к файлу для чтения")
    this.isLoading = true
    try {
      this.currentData = await this.fileAPI.read(filePath)
      return this.currentData
    } finally {
      this.isLoading = false
    }
  }

  async writeFile(data, filePath = this.currentFilePath) {
    if (!filePath) throw new Error("Нет пути к файлу для записи")
    this.isLoading = true
    try {
      await this.fileAPI.write(filePath, data)
      this.currentData = data
    } finally {
      this.isLoading = false
    }
  }

  clear() {
    this.currentFilePath = null
    this.currentData = null
  }
}
