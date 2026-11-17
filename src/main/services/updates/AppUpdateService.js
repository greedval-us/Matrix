import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { compareVersions, RELEASE_CHUNK_BYTES, updateError, validateRelease } from './releasePolicy.js';

export async function verifyReleaseFile(filePath, release) {
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink() || info.size !== release.size) throw new Error('Размер файла обновления изменился. Скачайте его заново.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  if (hash.digest('hex') !== release.sha256) throw new Error('Проверка файла обновления не пройдена. Скачайте его заново.');
}

/** Main owns all paths and trusted metadata; the renderer can only request fixed actions. */
export class AppUpdateService extends EventEmitter {
  constructor({ repository, currentVersion, target, directory, installer, currentExecutable = '' }) {
    super();
    Object.assign(this, { repository, target, directory, installer, currentExecutable });
    this.state = { status: 'idle', currentVersion, release: null, canInstall: Boolean(installer?.canInstall), progress: 0, error: '', checkedAt: null };
    this.closed = false;
  }

  getState() { return structuredClone(this.state); }
  setState(values) { Object.assign(this.state, values); this.emit('state', this.getState()); return this.getState(); }

  check({ force = false } = {}) {
    if (this.checking) return this.checking;
    if (this.closed || this.saving || ['downloading', 'installing'].includes(this.state.status) || this.state.status === 'ready' && !force) return Promise.resolve(this.getState());
    this.checking = this.performCheck().finally(() => { this.checking = null; });
    return this.checking;
  }

  async performCheck() {
    const previous = this.state;
    const previousStatus = previous.status;
    const previousRelease = previous.release;
    this.setState({ status: 'checking', error: '' });
    try {
      const release = this.target ? validateRelease(await this.repository.getLatest(this.target), this.target) : null;
      if (this.closed) return this.getState();
      const newer = release && compareVersions(release.version, this.state.currentVersion) > 0;
      if (this.staged && newer && previousRelease?.version === release.version && previousRelease?.sha256 === release.sha256 && previousRelease?.size === release.size) {
        return this.setState({ status: 'ready', release, progress: 100, checkedAt: Date.now() });
      }
      await this.clearStaged();
      return this.setState({ status: newer ? 'available' : 'idle', release: newer ? release : null, progress: 0, checkedAt: Date.now() });
    } catch (error) {
      if (this.closed) return this.getState();
      if ([5, 12].includes(error?.code)) {
        await this.clearStaged();
        return this.setState({ status: 'idle', release: null, progress: 0, error: '', checkedAt: Date.now() });
      }
      return this.setState({ status: previousStatus === 'ready' ? 'ready' : 'error', error: updateError(error, 'check'), checkedAt: Date.now() });
    }
  }

  download() {
    if (this.downloading) return this.downloading;
    if (this.closed || this.state.status === 'ready') return Promise.resolve(this.getState());
    if (!this.state.release || ['checking', 'installing'].includes(this.state.status)) return Promise.reject(new Error('Сначала проверьте наличие обновлений.'));
    this.controller = new AbortController();
    this.downloading = this.performDownload(this.controller.signal).finally(() => { this.downloading = null; this.controller = null; });
    return this.downloading;
  }

  async performDownload(signal) {
    const release = this.state.release;
    const staged = path.join(this.directory, `${randomUUID()}${path.extname(release.name)}`);
    const partial = `${staged}.part`;
    let handle;
    this.setState({ status: 'downloading', progress: 0, error: '' });
    try {
      await mkdir(this.directory, { recursive: true });
      signal.throwIfAborted();
      handle = await open(partial, 'wx', 0o600);
      const hash = createHash('sha256');
      let received = 0;
      for await (const chunk of this.repository.download(release, { signal })) {
        signal.throwIfAborted();
        if (!Buffer.isBuffer(chunk) || chunk.length === 0 || chunk.length > RELEASE_CHUNK_BYTES) throw new Error('Invalid release chunk');
        received += chunk.length;
        if (received > release.size) throw new Error('Release exceeds expected size');
        hash.update(chunk);
        await handle.writeFile(chunk);
        const progress = Math.floor(received / release.size * 100);
        if (progress !== this.state.progress) this.setState({ progress });
      }
      signal.throwIfAborted();
      if (received !== release.size || hash.digest('hex') !== release.sha256) throw new Error('Release integrity check failed');
      await handle.sync();
      await handle.close(); handle = null;
      signal.throwIfAborted();
      await rename(partial, staged);
      this.staged = staged;
      return this.setState({ status: 'ready', progress: 100 });
    } catch (error) {
      await handle?.close().catch(() => {});
      await rm(partial, { force: true }).catch(() => {});
      await rm(staged, { force: true }).catch(() => {});
      return this.setState({ status: signal.aborted ? 'available' : 'error', progress: 0, error: signal.aborted ? '' : updateError(error) });
    }
  }

  async cancel() {
    this.controller?.abort(new Error('Загрузка отменена.'));
    await this.downloading;
    return this.getState();
  }

  async install() {
    if (this.closed || this.saving || this.state.status !== 'ready' || !this.staged || !this.installer?.canInstall) throw new Error('Обновление с перезапуском доступно для скачанной portable-версии Windows.');
    this.installation = this.prepareInstallation();
    try { return await this.installation; }
    finally { this.installation = null; }
  }

  async prepareInstallation() {
    this.setState({ status: 'installing', error: '' });
    try {
      await this.verifyStaged();
      await this.installer.prepare({ filePath: this.staged, sha256: this.state.release.sha256, size: this.state.release.size });
      return this.getState();
    } catch (error) {
      if (this.staged) this.setState({ status: 'ready', error: 'Не удалось подготовить замену приложения. Можно сохранить файл обновления и запустить его вручную.' });
      throw new Error(this.state.error, { cause: error });
    }
  }

  async saveCopy(choosePath) {
    if (this.saving || this.state.status === 'installing' || this.closed) return { saved: false };
    this.saving = true;
    let temporary;
    try {
      const state = await this.download();
      if (state.status !== 'ready' || !this.staged) throw new Error(state.error || 'Сначала скачайте обновление.');
      const destination = await choosePath(state.release.name);
      if (!destination) return { saved: false };
      if (this.currentExecutable && path.resolve(destination).toLowerCase() === path.resolve(this.currentExecutable).toLowerCase()) throw new Error('Для замены запущенного приложения используйте кнопку обновления с перезапуском.');
      await this.verifyStaged();
      temporary = path.join(path.dirname(destination), `.matrix-download-${randomUUID()}.tmp`);
      await copyFile(this.staged, temporary);
      await verifyReleaseFile(temporary, state.release);
      if (state.release.kind === 'appimage') await chmod(temporary, 0o700);
      await rename(temporary, destination);
      return { saved: true };
    } finally {
      if (temporary) await rm(temporary, { force: true }).catch(() => {});
      this.saving = false;
    }
  }

  async clearStaged() {
    if (this.staged) await rm(this.staged, { force: true }).catch(() => {});
    this.staged = null;
  }

  async verifyStaged() {
    try { await verifyReleaseFile(this.staged, this.state.release); }
    catch (error) {
      await this.clearStaged();
      this.setState({ status: 'error', progress: 0, error: 'Файл обновления повреждён или удалён. Скачайте его заново.' });
      throw error;
    }
  }

  start() {
    this.startTimer = setTimeout(() => { void this.check(); }, 3000);
    this.pollTimer = setInterval(() => { void this.check(); }, 30 * 60 * 1000);
    this.startTimer.unref?.(); this.pollTimer.unref?.();
  }

  async shutdown() {
    this.closed = true;
    clearTimeout(this.startTimer); clearInterval(this.pollTimer);
    this.repository.shutdown();
    await this.cancel();
    await this.checking;
    // Preparation copies onto the EXE's volume before its readiness handshake.
    // Native window close must not remove that source while the copy is pending.
    await this.installation?.catch(() => {});
    await this.clearStaged();
    this.removeAllListeners();
  }
}
