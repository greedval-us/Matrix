import { FileService } from "../services/FileService.js";
import { FileDialogHandler } from "./FileDialogHandler.js";

import { StoreService } from "../services/StoreService.js";
import { StoreHandler } from "./StoreHandler.js";

import { SearchHandler } from "./SearchHandler.js";

export class IPCManager {
  constructor() {
    this.handlers = [];
    this.searchHandler = null;
  }

  init() {
    const fileService = new FileService();
    this.handlers.push(new FileDialogHandler(fileService));

    const storeService = new StoreService({
      theme: { type: "string", default: "light" },
      lastOpenedFile: { type: "string", default: "" },
    });
    this.handlers.push(new StoreHandler(storeService));

    this.searchHandler = new SearchHandler(storeService);
    this.handlers.push(this.searchHandler);

    this.handlers.forEach((handler) => handler.register());
  }

  shutdown() {
    this.searchHandler?.shutdown();
  }
}
