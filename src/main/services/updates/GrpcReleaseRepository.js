import { createHash } from 'node:crypto';
import { grpc, loadProto } from '../../utils/grpcLoader.js';
import { createApiKeyMetadata, createGrpcChannelOptions, deadlineAfter } from '../../utils/grpcConnection.js';
import { RELEASE_CHUNK_BYTES, validateRelease } from './releasePolicy.js';

function authority(config) {
  return createHash('sha256').update(JSON.stringify([config.endpoint, config.tlsServerName, config.apiKey])).update(config.caCertificate).digest('hex');
}

export class GrpcReleaseRepository {
  constructor({ connectionService, dependencies = {} }) {
    this.connectionService = connectionService;
    this.grpc = dependencies.grpc || grpc;
    this.loadProto = dependencies.loadProto || loadProto;
    this.operations = new Set();
    this.closed = false;
  }

  async open(download = false) {
    if (this.closed) throw new Error('Клиент обновлений закрыт.');
    const config = await this.connectionService.getResolvedConfig();
    if (this.closed) throw new Error('Клиент обновлений закрыт.');
    const fingerprint = authority(config);
    if (download && fingerprint !== this.source) throw new Error('Настройки подключения изменились. Проверьте обновления заново.');
    const Client = this.loadProto('releases.proto').matrix.releases.v1.Releases;
    const client = new Client(config.endpoint, this.grpc.credentials.createSsl(config.caCertificate), createGrpcChannelOptions(config));
    const operation = { client, fingerprint, calls: new Set(), options: { deadline: deadlineAfter(download ? 60 * 60 * 1000 : config.connectionTimeoutMs) },
      metadataFor: method => createApiKeyMetadata(this.grpc, config, client[method].path) };
    this.operations.add(operation);
    return operation;
  }

  finish(operation) {
    if (!this.operations.delete(operation)) return;
    for (const call of operation.calls) call.cancel();
    operation.client.close();
  }

  async getLatest(target) {
    const operation = await this.open();
    try {
      const release = await new Promise((resolve, reject) => {
        const call = operation.client.getLatest(target, operation.metadataFor('getLatest'), operation.options, (error, result) => error ? reject(error) : resolve(result));
        operation.calls.add(call);
      });
      this.source = operation.fingerprint;
      return release;
    } finally { this.finish(operation); }
  }

  async *download(release, { signal }) {
    signal.throwIfAborted();
    const operation = await this.open(true);
    let abort;
    try {
      signal.throwIfAborted();
      const request = { platform: release.platform, arch: release.arch, kind: release.kind, version: release.version, sha256: release.sha256 };
      const call = operation.client.download(request, operation.metadataFor('download'), operation.options);
      operation.calls.add(call);
      abort = () => call.cancel();
      signal.addEventListener('abort', abort, { once: true });
      let header = false;
      for await (const frame of call) {
        signal.throwIfAborted();
        if (!header) {
          if (!frame.release || frame.data) throw new Error('Сервер не вернул описание файла обновления.');
          const actual = validateRelease(frame.release, release);
          if (['version', 'sha256', 'size', 'name'].some(key => actual[key] !== release[key])) throw new Error('Сервер вернул другой файл обновления.');
          header = true;
        } else {
          if (frame.release || !Buffer.isBuffer(frame.data) || !frame.data.length || frame.data.length > RELEASE_CHUNK_BYTES) throw new Error('Некорректный поток обновления.');
          yield frame.data;
        }
      }
      if (!header) throw new Error('Пустой ответ сервера обновлений.');
    } finally {
      if (abort) signal.removeEventListener('abort', abort);
      this.finish(operation);
    }
  }

  shutdown() { this.closed = true; for (const operation of this.operations) this.finish(operation); }
}
