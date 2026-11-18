import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configureProfilePaths } from '../../../src/main/profilePaths.js';
import { cleanupLegacyPortableBackup } from '../../../src/main/services/updates/legacyPortableBackup.js';

test('branded builds keep the existing profile and respect explicit profile paths', async (t) => {
  const appData = await mkdtemp(path.join(tmpdir(), 'model-404-profile-'));
  t.after(() => rm(appData, { recursive: true, force: true }));
  const configured = new Map();
  let explicit = '';
  const app = {
    commandLine: { getSwitchValue: key => key === 'user-data-dir' ? explicit : '' },
    getPath: key => key === 'appData' ? appData : undefined,
    setPath: (key, value) => configured.set(key, value),
  };
  configureProfilePaths(app);
  assert.deepEqual(Object.fromEntries(configured), {
    userData: path.join(appData, 'matrix'),
    sessionData: path.join(appData, 'matrix'),
  });
  await access(path.join(appData, 'matrix'));
  explicit = path.resolve('custom-profile');
  configured.clear();
  configureProfilePaths(app);
  assert.equal(configured.size, 0);
});

test('the first branded launch removes only the completed legacy backup matching the installed EXE', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'model-404-legacy-update-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'Matrix old name.exe');
  const updates = path.join(directory, 'updates');
  const installed = 'new version';
  const original = 'old version';
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  await writeFile(target, installed);
  async function record(overrides) {
    const id = randomUUID();
    const run = path.join(updates, `install-${id}`);
    const backupPath = path.join(directory, `.matrix-backup-${id}.exe`);
    await mkdir(run, { recursive: true });
    await writeFile(path.join(run, 'complete'), 'complete');
    await writeFile(backupPath, original);
    await writeFile(path.join(run, 'install.json'), JSON.stringify({
      targetPath: target, backupPath, size: installed.length, sha256: digest(installed),
      originalSha256: digest(original), ...overrides,
    }));
    return backupPath;
  }

  const historical = await record({ sha256: digest('historical release') });
  const newProtocol = await record({ protocolVersion: 2 });
  const intended = await record({});
  const options = { app: { isPackaged: true, getPath: () => directory }, platform: 'win32',
    environment: { PORTABLE_EXECUTABLE_FILE: target } };
  assert.equal(await cleanupLegacyPortableBackup(options), true);
  await assert.rejects(access(intended), { code: 'ENOENT' });
  await Promise.all([access(historical), access(newProtocol), access(target)]);
  assert.equal(await cleanupLegacyPortableBackup(options), false);
});
