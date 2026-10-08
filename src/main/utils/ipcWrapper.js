import log from "./logger.js";

/**
 * Оборачивает handler для ipcMain, логирует вызовы и ошибки
 * @param {string} channel - название канала
 * @param {(event, ...args) => any} handler - оригинальный обработчик
 */
export function wrapHandler(channel, handler) {
  return async (event, ...args) => {
    try {
      log.info(`[IPC] Call ${channel}`);
      const result = await handler(event, ...args);
      log.info(`[IPC] Success ${channel}`);
      return result;
    } catch (err) {
      log.error(`[IPC] Error ${channel}:`, err);
      throw err;
    }
  };
}
