import { getFileApi, getFileDialogApi } from '../infrastructure/desktopApi.js';

export class FileService {
  #pendingOperations = 0;

  constructor(fileDialog, fileAPI) {
    this.fileDialog = fileDialog;
    this.fileAPI = fileAPI;
    this.currentFilePath = null;
    this.currentData = null;
    this.isLoading = false;
  }

  async #withLoading(operation) {
    this.#pendingOperations++;
    this.isLoading = true;
    try {
      return await operation();
    } finally {
      this.#pendingOperations--;
      this.isLoading = this.#pendingOperations > 0;
    }
  }

  async openFile() {
    return this.#withLoading(async () => {
      const filePath = await (this.fileDialog ?? getFileDialogApi()).openFile();
      if (!filePath) return null;
      this.currentFilePath = filePath;
      this.currentData = await (this.fileAPI ?? getFileApi()).read(filePath);
      return { filePath, data: this.currentData };
    });
  }

  async openFolder() {
    return this.#withLoading(async () => {
      const folderPath = await (this.fileDialog ?? getFileDialogApi()).openFolder();
      return folderPath || null;
    });
  }

  async saveFile(defaultName = 'newFile.txt', filters = []) {
    return this.#withLoading(async () => {
      const filePath = await (this.fileAPI ?? getFileApi()).saveDialog(defaultName, filters);
      if (!filePath) return null;
      this.currentFilePath = filePath;
      return filePath;
    });
  }

  async readFile(filePath = this.currentFilePath) {
    if (!filePath) throw new Error('Нет пути к файлу для чтения');
    return this.#withLoading(async () => {
      this.currentData = await (this.fileAPI ?? getFileApi()).read(filePath);
      return this.currentData;
    });
  }

  async writeFile(data, filePath = this.currentFilePath) {
    if (!filePath) throw new Error('Нет пути к файлу для записи');
    return this.#withLoading(async () => {
      const isBinary = data instanceof Uint8Array || data instanceof ArrayBuffer;
      const saved = await (this.fileAPI ?? getFileApi()).write(filePath, data, isBinary);
      if (saved === false) throw new Error('Не удалось записать файл.');
      this.currentData = data;
    });
  }

  clear() {
    this.currentFilePath = null;
    this.currentData = null;
  }
}
