import { FileService } from "../services/FileService.js";
import { FileDialogHandler } from "./FileDialogHandler.js";

import { StoreService } from "../services/StoreService.js";
import { StoreHandler } from "./StoreHandler.js";

import { BaseSearchHandler } from "./BaseSearchHandler.js";
import { DatabaseAllHandler } from "./DatabaseAllHandler.js";

export class IPCManager {
  constructor() {
    this.handlers = [];
  }

  init() {
    const fileService = new FileService();
    this.handlers.push(new FileDialogHandler(fileService));

    const storeService = new StoreService({
      theme: { type: "string", default: "light" },
      lastOpenedFile: { type: "string", default: "" },
    });
    this.handlers.push(new StoreHandler(storeService));

    this.handlers.push(new BaseSearchHandler());
    this.handlers.push(new DatabaseAllHandler());

    this.handlers.forEach((h) => h.register());
  }
}
