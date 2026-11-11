#!/usr/bin/env node
import { SearchClientService, SEARCH_FIELDS } from "../src/main/services/SearchClientService.js";
import { ServerConnectionService } from "../src/main/services/ServerConnectionService.js";
import { DEFAULT_SERVER_CONFIG } from "../src/shared/constants/serverConfig.js";

function parseArgs(argv) {
  const result = {
    endpoint: process.env.MATRIX_GRPC_ENDPOINT || DEFAULT_SERVER_CONFIG.endpoint,
    caCertificatePath: process.env.MATRIX_CA_CERT_PATH || "",
    tlsServerName: process.env.MATRIX_TLS_SERVER_NAME || "",
    field: "number",
    value: "",
    pageSize: 50,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Не задано значение для ${key}`);
    if (key === "--endpoint") result.endpoint = value;
    else if (key === "--field") result.field = value;
    else if (key === "--value") result.value = value;
    else if (key === "--page-size") result.pageSize = Number.parseInt(value, 10);
    else if (key === "--ca-certificate") result.caCertificatePath = value;
    else if (key === "--tls-server-name") result.tlsServerName = value;
    else throw new Error(`Неизвестный аргумент: ${key}`);
  }
  if (!SEARCH_FIELDS.includes(result.field)) throw new Error(`Неизвестное поле: ${result.field}`);
  if (!result.value) throw new Error("Укажите --value для проверочного поиска");
  return result;
}

const args = parseArgs(process.argv.slice(2));
const values = new Map([
  ["searchServer", { endpoint: args.endpoint, pageSize: args.pageSize, tlsServerName: args.tlsServerName }],
]);
const connectionService = new ServerConnectionService({
  get: (key) => values.get(key),
  set: (key, value) => values.set(key, value),
}, { bundledCertificatePath: args.caCertificatePath });
const client = new SearchClientService({ connectionService });
let received = 0;

try {
  const meta = await client.search(
    { [args.field]: args.value },
    {
      onChunk: (items) => {
        received += items.filter((item) => item.object_data).length;
      },
    }
  );
  console.log(JSON.stringify({ received, ...meta }, null, 2));
} finally {
  await client.dispose();
}
