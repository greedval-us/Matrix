import electron from "electron";
import fs from "node:fs/promises";
import path from "node:path";

const TEXT_FILTERS = Object.freeze([{ name: "Text", extensions: ["txt"] }]);
const CERTIFICATE_FILTERS = Object.freeze([{ name: "TLS certificate", extensions: ["crt", "pem", "cer"] }]);

export class FileService {
  constructor({ dialog = electron.dialog, fileSystem = fs } = {}) {
    this.dialog = dialog;
    this.fileSystem = fileSystem;
  }

  async chooseFile(options) {
    const { canceled, filePaths } = await this.dialog.showOpenDialog(options);
    return canceled ? null : filePaths[0];
  }

  openFile() {
    return this.chooseFile({ properties: ["openFile"], filters: [{ name: "Text Files", extensions: ["txt"] }] });
  }

  openCertificate() {
    return this.chooseFile({ properties: ["openFile"], filters: CERTIFICATE_FILTERS });
  }

  openFolder() {
    return this.chooseFile({ properties: ["openDirectory"] });
  }

  async saveFile(defaultName = "newfile.txt", filters = TEXT_FILTERS) {
    const { canceled, filePath } = await this.dialog.showSaveDialog({
      defaultPath: defaultName,
      filters,
    });
    return canceled ? null : filePath;
  }

  async readFile(filePath) {
    if (!filePath) return null;
    return await this.fileSystem.readFile(filePath, "utf8");
  }

  async writeFile(filePath, data, isBinary = false) {
    if (!filePath) return false;
    const directory = path.dirname(filePath);
    if (directory && directory !== path.parse(directory).root) {
      await this.fileSystem.mkdir(directory, { recursive: true });
    }
    if (isBinary) await this.fileSystem.writeFile(filePath, Buffer.from(data));
    else await this.fileSystem.writeFile(filePath, data, "utf8");
    return true;
  }
}
