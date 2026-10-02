#!/usr/bin/env node
import { SearchClientService, SEARCH_FIELDS } from "../src/main/services/SearchClientService.js";
import { ServerConnectionService } from "../src/main/services/ServerConnectionService.js";

function parseArgs(argv) {
  const result = {
    endpoint: process.env.MATRIX_GRPC_ENDPOINT || "192.168.1.46:50051",
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
    else throw new Error(`Неизвестный аргумент: ${key}`);
  }
  if (!SEARCH_FIELDS.includes(result.field)) throw new Error(`Неизвестное поле: ${result.field}`);
  if (!result.value) throw new Error("Укажите --value для проверочного поиска");
  return result;
}

const args = parseArgs(process.argv.slice(2));
const values = new Map([
  ["searchServer", { endpoint: args.endpoint, pageSize: args.pageSize }],
]);
const connectionService = new ServerConnectionService({
  get: (key) => values.get(key),
  set: (key, value) => values.set(key, value),
});
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
