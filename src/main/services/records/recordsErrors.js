import { grpc } from '../../utils/grpcLoader.js';

export class RecordsError extends Error {}
export class ConfigurationError extends RecordsError {}

const GRPC_ERROR_MESSAGES = Object.freeze({
  [grpc.status.UNAUTHENTICATED]: 'Сервер отклонил API-ключ.',
  [grpc.status.PERMISSION_DENIED]: 'Недостаточно прав для операции с записями.',
  [grpc.status.UNAVAILABLE]: 'Сервер записей недоступен.',
  [grpc.status.UNIMPLEMENTED]: 'Сервер не поддерживает раздел «Контроль».',
  [grpc.status.NOT_FOUND]: 'Запись или файл не найдены.',
  [grpc.status.INVALID_ARGUMENT]: 'Сервер отклонил данные записи или файла.',
  [grpc.status.RESOURCE_EXHAUSTED]: 'Превышен лимит файлов или сервер занят.',
  [grpc.status.DEADLINE_EXCEEDED]: 'Истекло время ожидания ответа сервера записей.',
  [grpc.status.CANCELLED]: 'Операция с записями отменена.',
  [grpc.status.FAILED_PRECONDITION]: 'Операция недоступна для текущего состояния записи.',
});

export function safeError(error) {
  if (error instanceof RecordsError) return error;
  return new RecordsError(GRPC_ERROR_MESSAGES[error?.code] || 'Не удалось выполнить операцию с записями. Повторите попытку.');
}
