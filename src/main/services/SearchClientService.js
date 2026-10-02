import { grpc, loadProto } from "../utils/grpcLoader.js";

const SEARCH_FIELDS = Object.freeze([
  "number", "mail", "snils", "inn", "passport", "fio", "date_of_birth",
  "telegram", "vk", "facebook", "imsi", "imei", "grz", "vin",
]);

function deadlineAfter(milliseconds) {
  return new Date(Date.now() + milliseconds);
}

function grpcError(error) {
  if (!error) return new Error("Неизвестная ошибка сервера поиска");
  const details = error.details || error.message || String(error);
  switch (error.code) {
    case grpc.status.UNAUTHENTICATED:
      return new Error("Сервер отклонил API-ключ");
    case grpc.status.UNAVAILABLE:
      return new Error(`Сервер поиска недоступен: ${details}`);
    case grpc.status.INVALID_ARGUMENT:
      return new Error(details);
    case grpc.status.RESOURCE_EXHAUSTED:
      return new Error("Сервер занят. Повторите поиск через несколько секунд");
    case grpc.status.DEADLINE_EXCEEDED:
      return new Error("Не удалось подключиться к серверу за отведённое время. Повторите попытку");
    default:
      return new Error(details);
  }
}

export class SearchClientService {
  constructor({ connectionService, configOverride = {}, dependencies = {} }) {
    this.connectionService = connectionService;
    this.configOverride = configOverride;
    this.grpc = dependencies.grpc || grpc;
    this.loadProto = dependencies.loadProto || loadProto;
    this.searchClient = null;
    this.databaseClient = null;
    this.config = null;
    this.activeCall = null;
    this.cancelled = false;
  }

  async connect() {
    if (this.searchClient && this.databaseClient) return await this.getIndexStatus();

    this.config = await this.connectionService.getResolvedConfig(this.configOverride);
    const credentials = this.grpc.credentials.createSsl(this.config.caCertificate);
    const options = {
      "grpc.keepalive_time_ms": 60000,
      "grpc.keepalive_timeout_ms": 10000,
      "grpc.max_receive_message_length": 32 * 1024 * 1024,
    };
    if (this.config.tlsServerName) {
      options["grpc.ssl_target_name_override"] = this.config.tlsServerName;
      options["grpc.default_authority"] = this.config.tlsServerName;
    }
    const baseSearch = this.loadProto("base_search.proto").base_search;
    const databaseAll = this.loadProto("database_all.proto").database_all;
    this.searchClient = new baseSearch.BaseSearches(this.config.endpoint, credentials, options);
    this.databaseClient = new databaseAll.DatabaseAll(this.config.endpoint, credentials, options);

    try {
      await new Promise((resolve, reject) => {
        this.searchClient.waitForReady(
          deadlineAfter(this.config.connectionTimeoutMs),
          (error) => (error ? reject(error) : resolve())
        );
      });
      return await this.getIndexStatus();
    } catch (error) {
      await this.dispose();
      throw grpcError(error);
    }
  }

  createMetadata() {
    const metadata = new this.grpc.Metadata();
    metadata.set("x-api-key", this.config.apiKey);
    return metadata;
  }

  async search(payload, { onChunk } = {}) {
    await this.connect();
    if (this.activeCall) throw new Error("Поиск в этой вкладке уже выполняется");

    const request = Object.fromEntries(
      SEARCH_FIELDS.map((field) => [field, String(payload?.[field] || "").trim()])
    );
    request.limit = this.config.pageSize;
    if (!SEARCH_FIELDS.some((field) => request[field])) {
      throw new Error("Заполните хотя бы одно поле поиска");
    }

    this.cancelled = false;
    return await new Promise((resolve, reject) => {
      const call = this.searchClient.streamSearch(request, this.createMetadata());
      this.activeCall = call;
      let batch = [];
      let meta = null;
      let settled = false;

      const flush = () => {
        if (batch.length === 0) return;
        const items = batch;
        batch = [];
        onChunk?.(items);
      };
      const finish = (action) => {
        if (settled) return;
        settled = true;
        flush();
        this.activeCall = null;
        action();
      };

      call.on("data", (message) => {
        if (message.meta) {
          meta = message.meta;
          return;
        }
        batch.push(message);
        if (batch.length >= 100) flush();
      });
      call.on("end", () => finish(() => resolve(meta || {})));
      call.on("error", (error) => {
        if (this.cancelled && error.code === this.grpc.status.CANCELLED) {
          finish(() => resolve({ cancelled: true }));
          return;
        }
        finish(() => reject(grpcError(error)));
      });
    });
  }

  async listDatabases(payload = {}) {
    await this.connect();
    return await new Promise((resolve, reject) => {
      const rows = [];
      const call = this.databaseClient.streamDatabaseAll(
        { request: String(payload.request || "") },
        this.createMetadata()
      );
      call.on("data", (row) => rows.push(row));
      call.on("end", () => resolve(rows));
      call.on("error", (error) => reject(grpcError(error)));
    });
  }

  async getIndexStatus() {
    if (!this.searchClient) throw new Error("Соединение с сервером не установлено");
    return await new Promise((resolve, reject) => {
      this.searchClient.getIndexStatus(
        {},
        this.createMetadata(),
        { deadline: deadlineAfter(this.config.connectionTimeoutMs) },
        (error, response) => (error ? reject(grpcError(error)) : resolve(response))
      );
    });
  }

  cancel() {
    if (!this.activeCall) return;
    this.cancelled = true;
    this.activeCall.cancel();
  }

  async dispose() {
    this.cancel();
    this.searchClient?.close();
    this.databaseClient?.close();
    this.searchClient = null;
    this.databaseClient = null;
    this.activeCall = null;
  }
}

export { SEARCH_FIELDS, grpcError };
