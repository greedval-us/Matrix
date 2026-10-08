import { FileService } from "../services/FileService.js";
import { FileDialogHandler } from "./FileDialogHandler.js";
import { StoreService } from "../services/StoreService.js";
import { StoreHandler } from "./StoreHandler.js";
import { SearchHandler } from "./SearchHandler.js";

export class IPCManager {
  constructor() { this.handlers = []; }

  init() {
    if (this.handlers.length) return;
    const storeService = new StoreService({
      theme: { type: "string", default: "light" },
      lastOpenedFile: { type: "string", default: "" },
    });
    this.handlers = [
      new FileDialogHandler(new FileService()),
      new StoreHandler(storeService),
      new SearchHandler(storeService),
    ];
    this.handlers.forEach((handler) => handler.register());
  }

  async shutdown() {
    const handlers = this.handlers;
    this.handlers = [];
    await Promise.all(handlers.map((handler) => handler.shutdown()));
  }
}
