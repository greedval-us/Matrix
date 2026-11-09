import { grpc, loadProto } from '../../utils/grpcLoader.js';
import { createApiKeyMetadata, createGrpcChannelOptions, deadlineAfter } from '../../utils/grpcConnection.js';
import { ConfigurationError, RecordsError, safeError } from './recordsErrors.js';
import { capabilitiesMetadata, fileReference, identifier, listMetadata, recordMetadata } from './recordsProtocol.js';
import { downloadRecordFile, uploadRecordFiles, validateUploadFiles } from './recordsFileTransfer.js';
import { RECORDS_TRANSFER_LIMITS } from './recordsTransferPolicy.js';

/** Authenticated main-only adapter; one transport per operation follows current settings. */
export class GrpcRecordsRepository {
  constructor({ connectionService, dependencies = {} }) {
    this.connectionService = connectionService;
    this.grpc = dependencies.grpc || grpc;
    this.loadProto = dependencies.loadProto || loadProto;
    this.operations = new Set();
    this.closed = false;
  }

  async open(fileOperation = false) {
    if (this.closed) throw new RecordsError('Клиент записей закрыт.');
    let config;
    try { config = await this.connectionService.getResolvedConfig(); }
    catch { throw new ConfigurationError('Проверьте настройки подключения к серверу записей.'); }
    if (this.closed) throw new RecordsError('Клиент записей закрыт.');
    const credentials = this.grpc.credentials.createSsl(config.caCertificate);
    const options = createGrpcChannelOptions(config);
    const Client = this.loadProto('records.proto').matrix.records.v1.Records;
    const metadata = createApiKeyMetadata(this.grpc, config.apiKey);
    const operation = { client: new Client(config.endpoint, credentials, options), metadata,
      options: { deadline: deadlineAfter(Math.max(config.connectionTimeoutMs, fileOperation ? RECORDS_TRANSFER_LIMITS.timeoutMs : 0)) },
      calls: new Set(), controller: new AbortController(), source: null };
    this.operations.add(operation);
    return operation;
  }

  finish(operation) {
    if (!this.operations.delete(operation)) return;
    operation.controller.abort(new RecordsError('Операция с записями отменена.'));
    operation.source?.destroy();
    for (const call of operation.calls) call.cancel();
    operation.client.close();
  }

  unary(operation, method, request) {
    return new Promise((resolve, reject) => {
      const call = operation.client[method](request, operation.metadata, operation.options, (error, response) => error ? reject(error) : resolve(response));
      operation.calls.add(call);
    });
  }

  async execute(callback, fileOperation = false) {
    let operation;
    try { operation = await this.open(fileOperation); return await callback(operation); }
    catch (error) { throw safeError(error); }
    finally { if (operation) this.finish(operation); }
  }

  async getCapabilities() {
    let operation;
    try {
      operation = await this.open();
      return capabilitiesMetadata(await this.unary(operation, 'getCapabilities', {}));
    } catch (error) {
      if (error instanceof ConfigurationError || [this.grpc.status.UNIMPLEMENTED, this.grpc.status.UNAVAILABLE].includes(error?.code)) return capabilitiesMetadata();
      throw safeError(error);
    } finally { if (operation) this.finish(operation); }
  }

  async list({ query, sort, page, pageSize }) {
    return this.execute(async operation => listMetadata(await this.unary(operation, 'listRecords', {
      query, sort_key: sort?.key || '', sort_direction: sort?.direction || '', page, page_size: pageSize,
    })));
  }

  async createRecord({ values }) {
    return this.execute(async operation => recordMetadata(await this.unary(operation, 'createRecord', { values })));
  }

  async updateRecord({ rowId, values }) {
    return this.execute(async operation => recordMetadata(await this.unary(operation, 'updateRecord', { id: identifier(rowId), values })));
  }

  async deleteRecord({ rowId }) {
    return this.execute(async operation => {
      let result;
      try { result = await this.unary(operation, 'deleteRecord', { id: identifier(rowId) }); }
      catch (error) {
        if (error?.code === this.grpc.status.FAILED_PRECONDITION) throw new RecordsError('Сначала удалите все вложения записи.');
        throw error;
      }
      if (result?.deleted !== true) throw new RecordsError('Сервер не подтвердил удаление записи.');
      return { deleted: true };
    });
  }

  async uploadFiles({ rowId, files }) {
    identifier(rowId);
    await validateUploadFiles(files);
    return this.execute(operation => uploadRecordFiles(operation, { rowId, files }), true);
  }

  async downloadFile(payload) {
    const request = fileReference(payload);
    let operation;
    try {
      operation = await this.open(true);
      return await downloadRecordFile(operation, request, payload, () => this.finish(operation));
    } catch (error) {
      if (operation) this.finish(operation);
      throw safeError(error);
    }
  }

  async removeFile(payload) {
    const request = fileReference(payload);
    return this.execute(async operation => {
      const result = await this.unary(operation, 'removeFile', request);
      if (result?.deleted !== true) throw new RecordsError('Сервер не подтвердил удаление файла.');
      return { removed: true };
    });
  }

  shutdown() {
    this.closed = true;
    for (const operation of this.operations) this.finish(operation);
  }
}
