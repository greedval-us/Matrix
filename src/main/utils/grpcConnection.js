const GRPC_MAX_RECEIVE_MESSAGE_BYTES = 32 * 1024 * 1024;

/** Shared channel configuration; each service still owns its transports. */
export function createGrpcChannelOptions(config, additionalOptions = {}) {
  const options = { 'grpc.max_receive_message_length': GRPC_MAX_RECEIVE_MESSAGE_BYTES, ...additionalOptions };
  if (config.tlsServerName) {
    options['grpc.ssl_target_name_override'] = config.tlsServerName;
    options['grpc.default_authority'] = config.tlsServerName;
  }
  return options;
}

export function createApiKeyMetadata(grpc, apiKey) {
  const metadata = new grpc.Metadata();
  metadata.set('x-api-key', apiKey);
  return metadata;
}

export function deadlineAfter(milliseconds) {
  return new Date(Date.now() + milliseconds);
}
