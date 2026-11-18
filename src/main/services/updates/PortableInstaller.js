import { spawn as spawnProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

async function digest(filePath) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(filePath)) hash.update(bytes);
  return hash.digest('hex');
}

async function verify(filePath, sha256, size) {
  const stat = await fs.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Update must be a regular file.');
  if (stat.size !== size) throw new Error('Update file size does not match the release.');
  if (await digest(filePath) !== sha256) throw new Error('Update SHA-256 hash does not match the release.');
}

async function readOptional(filePath) {
  try { return await fs.readFile(filePath, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/** Called only after the packaged main window has successfully loaded its UI. */
export async function acknowledgePortableUpdate({ app, environment = process.env, platform = process.platform,
  processId = process.pid, launcherPid = process.ppid } = {}) {
  const configPath = environment.MATRIX_UPDATE_ACK_CONFIG;
  const token = environment.MATRIX_UPDATE_ACK_TOKEN;
  delete environment.MATRIX_UPDATE_ACK_CONFIG;
  delete environment.MATRIX_UPDATE_ACK_TOKEN;
  if (platform !== 'win32' || !app?.isPackaged || !configPath || !token) return false;
  const userData = await fs.realpath(app.getPath('userData'));
  const resolvedConfig = await fs.realpath(configPath);
  const runDirectory = path.dirname(resolvedConfig);
  if (path.basename(resolvedConfig) !== 'install.json'
    || !/^install-[a-f\d-]{36}$/i.test(path.basename(runDirectory))
    || path.dirname(runDirectory).toLowerCase() !== path.join(userData, 'updates').toLowerCase()) {
    throw new Error('Invalid portable update acknowledgement profile.');
  }
  const config = JSON.parse(await fs.readFile(resolvedConfig, 'utf8'));
  const ackPath = path.join(runDirectory, 'started.json');
  const targetPath = await fs.realpath(environment.PORTABLE_EXECUTABLE_FILE || '');
  if (config.token !== token || config.ackPath !== ackPath
    || config.userDataPath.toLowerCase() !== userData.toLowerCase()
    || config.targetPath.toLowerCase() !== targetPath.toLowerCase()) {
    throw new Error('Invalid portable update acknowledgement token or target.');
  }
  await verify(targetPath, config.sha256, config.size);
  const temporary = `${ackPath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify({ token, processId, launcherPid }), { flag: 'wx' });
    await fs.rename(temporary, ackPath);
  } finally {
    await fs.unlink(temporary).catch(() => {});
  }
  return true;
}

export class PortableInstaller {
  constructor({ app, environment = process.env, platform = process.platform, spawn = spawnProcess,
    processId = process.pid, launcherPid = process.ppid, executablePath = process.execPath,
    handshakeTimeoutMs = 15000, exitTimeoutMs = 120000, startupTimeoutMs = 60000, startupStabilityMs = 2000 } = {}) {
    Object.assign(this, { app, environment, platform, spawn, processId, launcherPid, executablePath,
      handshakeTimeoutMs, exitTimeoutMs, startupTimeoutMs, startupStabilityMs });
    this.preparing = false;
    this.prepared = false;
  }

  get canInstall() {
    const target = this.environment.PORTABLE_EXECUTABLE_FILE;
    return this.platform === 'win32' && this.app?.isPackaged === true && typeof target === 'string'
      && /^(?:[a-z]:[\\/]|\\\\[^?\\]+\\[^\\]+\\)/i.test(target)
      && !/[\0\r\n]/.test(target) && path.win32.extname(target).toLowerCase() === '.exe';
  }

  // The caller quits Electron only after this handshake succeeds. Never use process.execPath
  // as the replacement target: NSIS portable runs Electron from a temporary extraction.
  async prepare({ filePath, sha256, size } = {}) {
    if (!this.canInstall) throw new Error('Automatic installation requires a packaged Windows portable app.');
    if (this.preparing || this.prepared) throw new Error('Portable installation is already prepared.');
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)
      || typeof sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(sha256)
      || !Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid portable update file metadata.');
    this.preparing = true;
    let child;
    let config;
    let candidatePath;
    try {
      const targetPath = await fs.realpath(this.environment.PORTABLE_EXECUTABLE_FILE);
      const sourcePath = await fs.realpath(filePath);
      if (sourcePath.toLowerCase() === targetPath.toLowerCase()) throw new Error('The original portable EXE cannot be the update source.');
      const originalStat = await fs.lstat(this.environment.PORTABLE_EXECUTABLE_FILE);
      if (!originalStat.isFile() || originalStat.isSymbolicLink()) throw new Error('The original portable EXE must be a regular file.');
      await verify(sourcePath, sha256.toLowerCase(), size);
      await fs.access(targetPath, constants.W_OK);

      const userData = await fs.realpath(this.app.getPath('userData'));
      const executableDirectory = path.dirname(await fs.realpath(this.executablePath));
      if (isWithin(executableDirectory, userData)) throw new Error('Updater data must be outside the temporary app extraction.');
      const id = randomUUID();
      const runDirectory = path.join(userData, 'updates', `install-${id}`);
      await fs.mkdir(runDirectory, { recursive: true });
      candidatePath = path.join(path.dirname(targetPath), `.matrix-update-${id}.exe`);
      config = {
        protocolVersion: 2,
        targetPath, candidatePath, backupPath: path.join(path.dirname(targetPath), `.matrix-backup-${id}.exe`),
        failedPath: path.join(path.dirname(targetPath), `.matrix-failed-${id}.exe`),
        sha256: sha256.toLowerCase(), size, originalSha256: await digest(targetPath),
        processId: this.processId, launcherPid: this.launcherPid, exitTimeoutMs: this.exitTimeoutMs,
        userDataPath: userData, startupTimeoutMs: this.startupTimeoutMs, startupStabilityMs: this.startupStabilityMs,
        token: randomUUID(), readyPath: path.join(runDirectory, 'ready'),
        ackPath: path.join(runDirectory, 'started.json'),
        cancelPath: path.join(runDirectory, 'cancel'), errorPath: path.join(runDirectory, 'error.txt'),
        logPath: path.join(runDirectory, 'install.log'), successPath: path.join(runDirectory, 'complete'),
      };
      // Copying onto the target volume is also the writable-directory and disk-space preflight.
      await fs.copyFile(sourcePath, candidatePath, constants.COPYFILE_EXCL);
      await verify(candidatePath, config.sha256, size);
      const helperPath = path.join(runDirectory, 'install.ps1');
      const bootstrapPath = path.join(runDirectory, 'launch.ps1');
      const configPath = path.join(runDirectory, 'install.json');
      // readFile is supported for bundled app.asar resources; copyFile is not universal.
      await fs.writeFile(helperPath, await fs.readFile(new URL('./portable-install.ps1', import.meta.url)), { flag: 'wx' });
      await fs.writeFile(bootstrapPath, await fs.readFile(new URL('./portable-launch.ps1', import.meta.url)), { flag: 'wx' });
      await fs.writeFile(configPath, JSON.stringify(config), { encoding: 'utf8', flag: 'wx' });
      const systemRoot = this.environment.SystemRoot || this.environment.SYSTEMROOT || 'C:\\Windows';
      if (!path.win32.isAbsolute(systemRoot)) throw new Error('Windows system directory must be absolute.');
      const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      child = this.spawn(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', bootstrapPath, '-HelperPath', helperPath, '-ConfigPath', configPath], {
        // The bootstrap gives the worker its own hidden console. DETACHED_PROCESS makes
        // Windows PowerShell exit before -File on some hosts, while inheriting the caller's
        // console can terminate the worker when Electron exits.
        cwd: runDirectory, env: { ...this.environment }, detached: false, windowsHide: true, shell: false, stdio: 'ignore',
      });
      let processError;
      child.on('error', (error) => { processError = error; });
      child.on('exit', (code) => {
        if (code !== 0) processError ||= new Error(`Portable installer launch failed (code ${code}).`);
      });
      const deadline = Date.now() + this.handshakeTimeoutMs;
      while (true) {
        if (processError) throw processError;
        const helperError = await readOptional(config.errorPath);
        if (helperError) throw new Error(`Portable installer: ${helperError}`);
        if (await readOptional(config.readyPath) === config.token) break;
        if (Date.now() >= deadline) throw new Error('Portable installer readiness timed out.');
        await delay(50);
      }
      if (processError) throw processError;
      child.unref();
      this.prepared = true;
      return true;
    } catch (error) {
      if (config) {
        await fs.writeFile(config.cancelPath, 'cancel').catch(() => {});
        await fs.appendFile(config.logPath, `${new Date().toISOString()} Preparation failed: ${error.message}\n`).catch(() => {});
      }
      try { child?.kill(); } catch { /* The process may already have exited. */ }
      if (candidatePath) await fs.unlink(candidatePath).catch(() => {});
      throw error;
    } finally {
      this.preparing = false;
    }
  }
}
