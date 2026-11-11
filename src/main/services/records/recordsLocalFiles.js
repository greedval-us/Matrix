import path from 'node:path';
import { pipeline } from 'node:stream/promises';

function suggestedFilename(value) {
  // A remote name is display data, never a path. Handle both slash conventions
  // even if this client is later packaged for a different operating system.
  const basename = path.posix.basename(path.win32.basename(String(value || 'Файл')));
  const sanitized = basename.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/g, '');
  return sanitized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(sanitized) ? sanitized : 'Файл';
}

async function closeSource(source) {
  if (typeof source?.destroy === 'function') source.destroy();
  else if (typeof source?.return === 'function') await source.return();
}

/** Main-only native file selection. Local paths are repository inputs, never IPC results. */
export async function selectRecordUploadFiles({ dialog, fileSystem }) {
  const selection = await dialog.showOpenDialog({ title: 'Добавить файлы к записи', properties: ['openFile', 'multiSelections'] });
  if (selection.canceled || !selection.filePaths?.length) return null;
  return Promise.all(selection.filePaths.map(async (filePath) => {
    const stat = await fileSystem.stat(filePath);
    if (!stat.isFile()) throw new Error('Для загрузки можно выбрать только файлы');
    return { path: filePath, name: path.basename(filePath), size: stat.size };
  }));
}

/** Owns the remote source and temporary file until cancellation, failure or publication. */
export async function saveRecordDownload(download, { dialog, fileSystem, createId }) {
  const source = download?.stream;
  let sourceError;
  const rememberError = (error) => { sourceError = error; };
  source?.on?.('error', rememberError);
  let temporaryPath;
  let ownedTemporary = false;
  let handle;
  let failed = false;
  let primaryError;
  try {
    if (!source || typeof source[Symbol.asyncIterator] !== 'function') throw new Error('Сервер не вернул поток файла');
    const selection = await dialog.showSaveDialog({ title: 'Сохранить файл', defaultPath: suggestedFilename(download.name) });
    if (selection.canceled) return { cancelled: true, saved: false };
    if (typeof selection.filePath !== 'string' || !path.isAbsolute(selection.filePath) || selection.filePath.includes('\0')) {
      throw new Error('Не удалось выбрать путь для сохранения');
    }
    if (sourceError) throw sourceError;
    temporaryPath = path.join(path.dirname(selection.filePath), `.${path.basename(selection.filePath)}.${createId()}.part`);
    handle = await fileSystem.open(temporaryPath, 'wx');
    ownedTemporary = true;
    // pipeline propagates failures and applies backpressure without loading
    // the entire file into renderer or main memory.
    await pipeline(source, handle.createWriteStream());
    await fileSystem.rename(temporaryPath, selection.filePath);
    ownedTemporary = false;
    return { cancelled: false, saved: true };
  } catch (error) {
    failed = true;
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    // Close handles before unlinking on Windows, but attempt each cleanup even
    // when a preceding one fails. The transfer failure remains the main error.
    for (const cleanup of [
      () => handle?.close(),
      () => closeSource(source),
      () => source?.removeListener?.('error', rememberError),
      () => ownedTemporary ? fileSystem.unlink(temporaryPath) : undefined,
    ]) {
      try { await cleanup(); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) {
      if (failed) {
        // Keep the original error identity/message for IPC and logging. Some
        // adapters may throw frozen or primitive errors; those still win.
        try { Object.defineProperty(primaryError, 'cleanupErrors', { value: cleanupErrors, configurable: true }); }
        catch {}
      } else {
        throw new AggregateError(cleanupErrors, cleanupErrors[0]?.message || 'Не удалось завершить работу с файлом', { cause: cleanupErrors[0] });
      }
    }
  }
}
