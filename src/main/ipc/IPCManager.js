import { FileService } from "../services/FileService.js";
import { FileDialogHandler } from "./FileDialogHandler.js";

import { StoreService } from "../services/StoreService.js";
import { StoreHandler } from "./StoreHandler.js";

import { SearchHandler } from "./SearchHandler.js";
import { DatabaseCatalogHandler } from "./DatabaseCatalogHandler.js";
import { LocalDatabaseHandler } from "./LocalDatabaseHandler.js";
import { ImportHandler } from "./ImportHandler.js";
import { IndexHandler } from "./IndexHandler.js";

export class IPCManager {
  constructor() {
    this.handlers = [];
    this.indexHandler = null;
  }

  init() {
    const fileService = new FileService();
    this.handlers.push(new FileDialogHandler(fileService));

    const storeService = new StoreService({
      theme: { type: "string", default: "light" },
      lastOpenedFile: { type: "string", default: "" },
    });
    this.handlers.push(new StoreHandler(storeService));

    this.handlers.push(new SearchHandler());
    this.handlers.push(new DatabaseCatalogHandler());
    this.handlers.push(new LocalDatabaseHandler());
    this.handlers.push(new ImportHandler());
    this.indexHandler = new IndexHandler();
    this.handlers.push(this.indexHandler);

    this.handlers.forEach((handler) => handler.register());
  }

  shutdown() {
    this.indexHandler?.requestStop("app-close");
  }
}
