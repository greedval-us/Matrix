import { grpc, loadProto } from "../utils/grpcLoader.js";
import { SEARCH_FIELD_IDS as SEARCH_FIELDS } from "../../shared/constants/searchItems.js";
import { SERVER_CONFIG_LIMITS } from "../../shared/constants/serverConfig.js";
const STREAM_CHUNK_SIZE = 100;
const GRPC_OPTIONS = Object.freeze({
  "grpc.keepalive_time_ms": 60000,
  "grpc.keepalive_timeout_ms": 10000,
  "grpc.max_receive_message_length": 32 * 1024 * 1024,
});

function deadlineAfter(milliseconds) { return new Date(Date.now() + milliseconds); }
const closedClientError = () => new Error("Клиент поиска закрыт");

function requestLimit(value, fallback) {
  if (value === undefined) return fallback;
  const { min, max } = SERVER_CONFIG_LIMITS.pageSize;
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Лимит поиска должен быть целым числом от ${min} до ${max}.`);
  }
  return value;
}

function grpcError(error) {
  if (!error) return new Error("Неизвестная ошибка сервера поиска");
  const details = error.details || error.message || String(error);
  switch (error.code) {
    case grpc.status.UNAUTHENTICATED: return new Error("Сервер отклонил API-ключ");
    case grpc.status.UNAVAILABLE: return new Error(`Сервер поиска недоступен: ${details}`);
    case grpc.status.INVALID_ARGUMENT: return new Error(details);
    case grpc.status.RESOURCE_EXHAUSTED: return new Error("Сервер занят. Повторите поиск через несколько секунд");
    case grpc.status.DEADLINE_EXCEEDED: return new Error("Не удалось подключиться к серверу за отведённое время. Повторите попытку");
    default: return new Error(details);
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
    this.searchPending = false;
    this.connectionPromise = null;
    this.generation = 0;
    this.closedTransports = new WeakSet();
  }

  connect() {
    if (this.connectionPromise) return this.connectionPromise;
    const generation = this.generation;
    const connecting = this.openConnection(generation);
    const pending = connecting.finally(() => {
      if (this.connectionPromise === pending) this.connectionPromise = null;
    });
    this.connectionPromise = pending;
    return pending;
  }

  async openConnection(generation) {
    let searchClient = this.searchClient;
    let databaseClient = this.databaseClient;
    const openingTransport = !searchClient || !databaseClient;
    try {
      let config = this.config;
      if (openingTransport) {
        config = await this.connectionService.getResolvedConfig(this.configOverride);
        if (generation !== this.generation) throw closedClientError();
        const credentials = this.grpc.credentials.createSsl(config.caCertificate);
        const options = { ...GRPC_OPTIONS };
        if (config.tlsServerName) {
          options["grpc.ssl_target_name_override"] = config.tlsServerName;
          options["grpc.default_authority"] = config.tlsServerName;
        }
        const baseSearch = this.loadProto("base_search.proto").base_search;
        const databaseAll = this.loadProto("database_all.proto").database_all;
        searchClient = new baseSearch.BaseSearches(config.endpoint, credentials, options);
        databaseClient = new databaseAll.DatabaseAll(config.endpoint, credentials, options);
        this.config = config;
        this.searchClient = searchClient;
        this.databaseClient = databaseClient;
        await new Promise((resolve, reject) => {
          searchClient.waitForReady(deadlineAfter(config.connectionTimeoutMs), (error) => error ? reject(error) : resolve());
        });
      }
      if (generation !== this.generation) throw closedClientError();
      const status = await this.fetchIndexStatus(searchClient, config);
      if (generation !== this.generation) throw closedClientError();
      return status;
    } catch (error) {
      // A late completion owns only its original transports, never a replacement.
      if (openingTransport) {
        try { this.closeTransports(searchClient, databaseClient); } catch {}
        if (this.searchClient === searchClient) this.searchClient = null;
        if (this.databaseClient === databaseClient) this.databaseClient = null;
      }
      throw generation !== this.generation ? closedClientError() : grpcError(error);
    }
  }

  createMetadata(config = this.config) {
    const metadata = new this.grpc.Metadata();
    metadata.set("x-api-key", config.apiKey);
    return metadata;
  }

  async search(payload, { onChunk } = {}) {
    if (this.searchPending) throw new Error("Поиск в этой вкладке уже выполняется");
    this.searchPending = true;
    this.cancelled = false;
    try {
      await this.connect();
      // Cancellation can arrive while TLS/status is still connecting, before a stream exists.
      if (this.cancelled) return { cancelled: true };
      const request = Object.fromEntries(SEARCH_FIELDS.map((field) => [field, String(payload?.[field] || "").trim()]));
      request.limit = requestLimit(payload?.limit, this.config.pageSize);
      if (!SEARCH_FIELDS.some((field) => request[field])) throw new Error("Заполните хотя бы одно поле поиска");

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
        const finish = (error, result) => {
          if (settled) return;
          settled = true;
          try { flush(); } catch (callbackError) { error ||= callbackError; }
          if (this.activeCall === call) this.activeCall = null;
          if (error) {
            reject(error);
            // Keep the error listener through cancellation; gRPC may emit it synchronously.
            try { call.cancel(); } catch {}
          } else resolve(result);
        };
        call.on("data", (message) => {
          if (settled) return;
          if (message.meta) { meta = message.meta; return; }
          batch.push(message);
          try { if (batch.length >= STREAM_CHUNK_SIZE) flush(); }
          catch (error) { finish(error); }
        });
        call.on("end", () => finish(null, this.cancelled ? { ...meta, cancelled: true } : meta || {}));
        call.on("error", (error) => {
          if (settled) return;
          if (this.cancelled && error.code === this.grpc.status.CANCELLED) finish(null, { cancelled: true });
          else finish(grpcError(error));
        });
      });
    } finally {
      this.searchPending = false;
    }
  }

  async listDatabases(payload = {}) {
    await this.connect();
    return await new Promise((resolve, reject) => {
      const rows = [];
      const call = this.databaseClient.streamDatabaseAll({ request: String(payload.request || "") }, this.createMetadata());
      call.on("data", (row) => rows.push(row));
      call.on("end", () => resolve(rows));
      call.on("error", (error) => reject(grpcError(error)));
    });
  }

  fetchIndexStatus(client, config) {
    return new Promise((resolve, reject) => {
      client.getIndexStatus({}, this.createMetadata(config), { deadline: deadlineAfter(config.connectionTimeoutMs) },
        (error, response) => error ? reject(grpcError(error)) : resolve(response));
    });
  }

  async getIndexStatus() {
    if (!this.searchClient) throw new Error("Соединение с сервером не установлено");
    return await this.fetchIndexStatus(this.searchClient, this.config);
  }

  cancel() {
    if (!this.searchPending) return;
    this.cancelled = true;
    this.activeCall?.cancel();
  }

  closeTransports(...clients) {
    let failure;
    for (const client of clients) {
      if (!client || this.closedTransports.has(client)) continue;
      this.closedTransports.add(client);
      try { client.close(); } catch (error) { failure ||= error; }
    }
    if (failure) throw failure;
  }

  async dispose() {
    this.generation += 1;
    this.connectionPromise = null;
    let failure;
    try { this.cancel(); } catch (error) { failure = error; }
    try { this.closeTransports(this.searchClient, this.databaseClient); } catch (error) { failure ||= error; }
    this.searchClient = null;
    this.databaseClient = null;
    this.activeCall = null;
    if (failure) throw failure;
  }
}

export { SEARCH_FIELDS, grpcError };
