import Store from "electron-store";
import { grpc, loadProto } from "../utils/grpcLoader.js";

const baseProto = loadProto("base_search.proto");

export class BaseSearchService {
  constructor(serverAddress) {
    const store = new Store();
    this.serverAddress = serverAddress || store.get("serverAddress") || "10.0.0.1:5196";
    this.client = new baseProto.base_search.BaseSearches(
      this.serverAddress,
      grpc.credentials.createInsecure()
    );
    this.currentCall = null;
  }

  async streamSearch(payload) {
    return new Promise((resolve, reject) => {
      const results = [];
      const call = this.client.StreamSearch(payload);
      this.currentCall = call;

      call.on("data", (r) => results.push(r));
      call.on("end", () => {
        this.currentCall = null;
        resolve(results);
      });
      call.on("error", (err) => {
        this.currentCall = null;
        reject(err);
      });
    });
  }

  cancel() {
    if (this.currentCall) {
      console.log("[gRPC] Отмена активного запроса");
      this.currentCall.cancel();
      this.currentCall = null;
    }
  }
}
