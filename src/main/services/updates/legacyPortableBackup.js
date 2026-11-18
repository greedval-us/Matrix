import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const installDirectory = /^install-([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/;
const sha256 = /^[a-f0-9]{64}$/;
const samePath = (left, right) => typeof left === 'string' && path.isAbsolute(left)
  && path.normalize(left).toLowerCase() === right.toLowerCase();
const fileInfo = name => lstat(name).catch(() => null);

async function digest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

// Old helpers leave the backup next to the launcher. Only the new app can
// confirm a successful startup for that transition.
export async function cleanupLegacyPortableBackup({
  app, platform = process.platform, environment = process.env,
} = {}) {
  const launcher = environment.PORTABLE_EXECUTABLE_FILE;
  if (platform !== 'win32' || !app?.isPackaged || typeof launcher !== 'string'
    || !path.isAbsolute(launcher) || path.extname(launcher).toLowerCase() !== '.exe') return false;
  if (!(await fileInfo(launcher))?.isFile()) return false;
  const target = await realpath(launcher);
  const size = (await lstat(target)).size;
  const updates = path.join(await realpath(app.getPath('userData')), 'updates');
  if (!(await fileInfo(updates))?.isDirectory()) return false;

  let installedHash;
  for (const entry of await readdir(updates, { withFileTypes: true })) {
    const id = installDirectory.exec(entry.name)?.[1];
    if (!entry.isDirectory() || !id) continue;
    const run = path.join(updates, entry.name);
    const configPath = path.join(run, 'install.json');
    const completePath = path.join(run, 'complete');
    const configInfo = await fileInfo(configPath);
    const completeInfo = await fileInfo(completePath);
    if (!configInfo?.isFile() || configInfo.size > 8192 || !completeInfo?.isFile() || completeInfo.size !== 8
      || await fileInfo(path.join(run, 'error.txt')) || await fileInfo(path.join(run, 'cancel'))) continue;
    let config;
    try { config = JSON.parse(await readFile(configPath, 'utf8')); }
    catch { continue; }
    const backup = path.join(path.dirname(target), `.matrix-backup-${id}.exe`);
    if (!config || config.protocolVersion !== undefined || config.ackPath !== undefined
      || !samePath(config.targetPath, target) || !samePath(config.backupPath, backup)
      || config.size !== size || !sha256.test(config.sha256) || !sha256.test(config.originalSha256)
      || config.sha256 === config.originalSha256 || !(await fileInfo(backup))?.isFile()
      || await readFile(completePath, 'utf8') !== 'complete') continue;
    installedHash ??= await digest(target);
    if (installedHash !== config.sha256 || await digest(backup) !== config.originalSha256) continue;
    await unlink(backup);
    return true;
  }
  return false;
}
