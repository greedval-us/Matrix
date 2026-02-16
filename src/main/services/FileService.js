import { dialog } from "electron";
import fs from "fs/promises";
import path from "path";

export class FileService {
  async openFile() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "Text Files", extensions: ["txt"] }
      ]
    });
    return canceled ? null : filePaths[0];
  }


  async openFolder() {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return canceled ? null : filePaths[0];
  }

  async saveFile(defaultName = "newfile.txt") {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    return canceled ? null : filePath;
  }

  async readFile(filePath) {
    if (!filePath) return null;
    return await fs.readFile(filePath, "utf8");
  }

  async writeFile(filePath, data, isBinary = false) {
    if (!filePath) return false;

    const dir = path.dirname(filePath);
    if (dir && dir !== path.parse(dir).root) {
      await fs.mkdir(dir, { recursive: true });
    }

    if (isBinary) {
      await fs.writeFile(filePath, Buffer.from(data));
    } else {
      await fs.writeFile(filePath, data, 'utf8');
    }

    return true;
  }
}
