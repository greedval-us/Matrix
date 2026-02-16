import Store from "electron-store";
import { grpc, loadProto } from "../utils/grpcLoader.js";

const dbAllProto = loadProto("database_all.proto");

export class DatabaseAllService {
  constructor(serverAddress) {
    const store = new Store();
    this.serverAddress = serverAddress || store.get("serverAddress") || "10.0.0.1:5196";
    this.client = new dbAllProto.database_all.DatabaseAll(
      this.serverAddress,
      grpc.credentials.createInsecure()
    );
  }

  async streamDatabaseAll(payload) {
    return new Promise((resolve, reject) => {
      const results = [];
      const call = this.client.StreamDatabaseAll(payload);

      call.on("data", (r) => results.push(r));
      call.on("end", () => resolve(results));
      call.on("error", reject);
    });
  }
}
