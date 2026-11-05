import path from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loaderOpts = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

export function loadProto(protoPath) {
  const fullPath = path.join(__dirname, '../../protos', protoPath);
  const packageDefinition = protoLoader.loadSync(fullPath, loaderOpts);
  return grpc.loadPackageDefinition(packageDefinition);
}

export { grpc };
