import { existsSync } from "node:fs";
import path from "node:path";
import { app, safeStorage } from "electron";
import { FileService } from "../services/FileService.js";
import { FileDialogHandler } from "./FileDialogHandler.js";
import { StoreService } from "../services/StoreService.js";
import { StoreHandler } from "./StoreHandler.js";
import { SearchHandler } from "./SearchHandler.js";
import { RecordsService } from "../services/RecordsService.js";
import { RecordsHandler } from "./RecordsHandler.js";
import { ServerConnectionService } from "../services/ServerConnectionService.js";
import { createDeviceIdentityStore } from "../services/DeviceAccessCredentials.js";
import { GrpcRecordsRepository } from "../services/records/GrpcRecordsRepository.js";
import { BUNDLED_CA_FILENAME } from "../../shared/constants/serverConfig.js";
import { AppUpdateService } from '../services/updates/AppUpdateService.js';
import { GrpcReleaseRepository } from '../services/updates/GrpcReleaseRepository.js';
import { PortableInstaller } from '../services/updates/PortableInstaller.js';
import { releaseTarget } from '../services/updates/releasePolicy.js';
import { UpdateHandler } from './UpdateHandler.js';

export class IPCManager {
  constructor() { this.handlers = []; }

  init() {
    if (this.handlers.length) return;
    const storeService = new StoreService({
      theme: { type: "string", default: "light" },
      lastOpenedFile: { type: "string", default: "" },
    });
    const certificatePath = app.isPackaged ? path.join(process.resourcesPath, BUNDLED_CA_FILENAME) : "";
    const connectionService = new ServerConnectionService(storeService, {
      bundledCertificatePath: existsSync(certificatePath) ? certificatePath : "",
      safeStorage,
      deviceIdentityStore: createDeviceIdentityStore(app.getPath("userData")),
    });
    this.handlers = [
      new FileDialogHandler(new FileService()),
      new StoreHandler(storeService),
      new SearchHandler(storeService, { connectionService }),
      new RecordsHandler(new RecordsService({ repository: new GrpcRecordsRepository({ connectionService }) })),
      new UpdateHandler(new AppUpdateService({
        repository: new GrpcReleaseRepository({ connectionService }),
        currentVersion: app.getVersion(), target: releaseTarget(),
        directory: path.join(app.getPath('userData'), 'updates', 'downloads'),
        installer: new PortableInstaller({ app }),
        currentExecutable: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath,
      })),
    ];
    this.handlers.forEach((handler) => handler.register());
  }

  async shutdown() {
    const handlers = this.handlers;
    this.handlers = [];
    await Promise.all(handlers.map((handler) => handler.shutdown()));
  }
}
