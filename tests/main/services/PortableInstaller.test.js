import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn as spawnProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { PortableInstaller } from '../../../src/main/services/updates/PortableInstaller.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const execFileAsync = promisify(execFile);

test('installation requires a packaged Windows app with an absolute portable EXE path', async () => {
  for (const options of [
    { platform: 'linux' },
    { app: { isPackaged: false } },
    { environment: {} },
    { environment: { PORTABLE_EXECUTABLE_FILE: 'Matrix.exe' } },
    { environment: { PORTABLE_EXECUTABLE_FILE: 'C:\\Apps\\Matrix.msi' } },
    { environment: { PORTABLE_EXECUTABLE_FILE: '\\Matrix.exe' } },
  ]) {
    const installer = new PortableInstaller({
      app: { isPackaged: true }, platform: 'win32',
      environment: { PORTABLE_EXECUTABLE_FILE: 'C:\\Apps\\Matrix.exe' }, ...options,
    });
    assert.equal(installer.canInstall, false);
    await assert.rejects(installer.prepare({}), /portable/i);
  }
  assert.equal(new PortableInstaller({
    app: { isPackaged: true }, platform: 'win32',
    environment: { PORTABLE_EXECUTABLE_FILE: 'C:\\Apps\\Matrix.exe' },
  }).canInstall, true);
});

async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-portable-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const targetDirectory = path.join(directory, "Путь ' $ [portable]");
  const userData = path.join(directory, "User ' $ [data]");
  await fs.mkdir(targetDirectory);
  await fs.mkdir(userData);
  const target = path.join(targetDirectory, 'Моя Матрица.exe');
  const filePath = path.join(directory, 'download.exe');
  await fs.writeFile(target, 'old executable');
  await fs.writeFile(filePath, 'new executable');
  const children = [];
  const launches = [];
  const spawn = (command, args, options) => {
    const child = new EventEmitter();
    child.unref = () => {};
    child.kill = () => { child.emit('exit', null, 'SIGTERM'); return true; };
    children.push(child);
    launches.push({ command, args, options });
    queueMicrotask(async () => {
      const configPath = args[args.indexOf('-ConfigPath') + 1];
      const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      await fs.writeFile(config.readyPath, config.token);
    });
    return child;
  };
  const installer = new PortableInstaller({
    app: { isPackaged: true, getPath: (key) => { assert.equal(key, 'userData'); return userData; } },
    platform: 'win32', environment: { ...process.env, PORTABLE_EXECUTABLE_FILE: target },
    spawn, handshakeTimeoutMs: 1000, ...overrides,
  });
  return { installer, directory, targetDirectory, userData, target, filePath, launches, children,
    update: { filePath, sha256: hash('new executable'), size: 14 } };
}

test('tampered staging bytes are rejected before helper starts or the original EXE changes', { skip: process.platform !== 'win32' }, async (t) => {
  const f = await fixture(t);
  await fs.writeFile(f.filePath, 'bad executable');
  await assert.rejects(f.installer.prepare(f.update), /SHA-256|hash/i);
  assert.equal(f.launches.length, 0);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'old executable');
});

test('a wrong size or the running EXE used as staging is rejected', { skip: process.platform !== 'win32' }, async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.installer.prepare({ ...f.update, size: 15 }), /size/i);
  await assert.rejects(f.installer.prepare({ filePath: f.target, sha256: hash('old executable'), size: 14 }), /same|original|target/i);
  assert.equal(f.launches.length, 0);
});

test('preparation preserves the original filename and sends unusual paths as data to a hidden helper', { skip: process.platform !== 'win32' }, async (t) => {
  const f = await fixture(t);
  assert.equal(await f.installer.prepare(f.update), true);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'old executable');
  assert.equal(f.launches.length, 1);
  const launch = f.launches[0];
  assert.equal(path.isAbsolute(launch.command), true);
  assert.equal(path.basename(launch.command).toLowerCase(), 'powershell.exe');
  assert.equal(launch.options.windowsHide, true);
  assert.equal(launch.options.shell, false);
  assert.equal(launch.args.includes('-Command'), false);
  const scriptPath = launch.args[launch.args.indexOf('-File') + 1];
  const configPath = launch.args[launch.args.indexOf('-ConfigPath') + 1];
  assert.equal(path.relative(f.userData, scriptPath).startsWith('..'), false);
  assert.equal(launch.options.cwd, path.dirname(scriptPath));
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  assert.equal(config.targetPath, f.target);
  assert.equal(path.dirname(config.candidatePath), f.targetDirectory);
  assert.equal(await fs.readFile(config.candidatePath, 'utf8'), 'new executable');
  assert.equal(config.sha256, hash('new executable'));
  assert.equal(config.originalSha256, hash('old executable'));
});

test('helper startup failure rejects preparation and preserves the current app and EXE', { skip: process.platform !== 'win32' }, async (t) => {
  const f = await fixture(t, {
    spawn: () => {
      const child = new EventEmitter();
      child.kill = () => true;
      queueMicrotask(() => child.emit('error', new Error('PowerShell unavailable')));
      return child;
    },
  });
  await assert.rejects(f.installer.prepare(f.update), /PowerShell unavailable/);
  assert.equal(await fs.readFile(f.target, 'utf8'), 'old executable');
  assert.deepEqual(await fs.readdir(f.targetDirectory), ['Моя Матрица.exe']);
});

test('missing helper readiness times out with a cancellation marker and leaves the original executable', { skip: process.platform !== 'win32' }, async (t) => {
  let launch;
  const f = await fixture(t, {
    handshakeTimeoutMs: 50,
    spawn: (command, args, options) => {
      launch = { args, options };
      const child = new EventEmitter();
      child.kill = () => true;
      // A successful bootstrap exit is not proof that the actual worker is ready.
      queueMicrotask(() => child.emit('exit', 0));
      return child;
    },
  });
  await assert.rejects(f.installer.prepare(f.update), /ready|readiness|timed out/i);
  const config = JSON.parse(await fs.readFile(launch.args[launch.args.indexOf('-ConfigPath') + 1], 'utf8'));
  assert.equal(await fs.readFile(f.target, 'utf8'), 'old executable');
  assert.equal(await fs.readFile(config.cancelPath, 'utf8'), 'cancel');
  await assert.rejects(fs.access(config.candidatePath));
  assert.match(await fs.readFile(config.logPath, 'utf8'), /ready|readiness|timed out/i);
});

async function waitForFile(filePath, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { return await fs.readFile(filePath, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function executableFixture(t, { nestedHelper = false, invalidUpdate = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "matrix-перенос ' $ [test]-"));
  const children = [];
  let config;
  t.after(async () => {
    if (nestedHelper && config && !(await fs.access(config.successPath).then(() => true, () => false))) {
      t.diagnostic(await fs.readFile(config.logPath, 'utf8').catch(() => 'no helper log'));
      t.diagnostic(await fs.readFile(config.errorPath, 'utf8').catch(() => 'no helper error'));
    }
    if (config) await fs.writeFile(config.cancelPath, 'cancel').catch(() => {});
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        const ended = new Promise((resolve) => child.once('exit', resolve));
        child.kill();
        await Promise.race([ended, delay(2000)]);
      }
    }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const sourcePath = path.join(directory, 'Fixture.cs');
  await fs.writeFile(sourcePath, `
using System;
using System.IO;
using System.Threading;
class Fixture {
  static int Main(string[] args) {
    string root = Environment.GetEnvironmentVariable("MATRIX_INSTALL_TEST_ROOT");
    if (args.Length > 0 && args[0] == "--launcher") {
      File.WriteAllText(Path.Combine(root, "launcher-ready"), "ready");
      while (!File.Exists(Path.Combine(root, "stop-launcher"))) Thread.Sleep(50);
      File.WriteAllText(Path.Combine(root, "cleanup-started"), "started");
      Thread.Sleep(500);
      File.WriteAllText(Path.Combine(root, "cleanup-finished"), "finished");
      return 0;
    }
#if UPDATED
    string name = "run-new";
#else
    string name = "run-old";
#endif
    File.WriteAllText(Path.Combine(root, name),
      (File.Exists(Path.Combine(root, "cleanup-finished")) ? "cleaned" : "RACED") + "|" +
      (Environment.GetEnvironmentVariable("PORTABLE_EXECUTABLE_FILE") ?? "cleared") + "|" +
      (Environment.GetEnvironmentVariable("PORTABLE_EXECUTABLE_DIR") ?? "cleared"));
    return 0;
  }
}`);
  const compiler = path.join(process.env.SystemRoot || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  const target = path.join(directory, 'Моя Матрица.exe');
  const download = path.join(directory, 'download.exe');
  await execFileAsync(compiler, ['/nologo', '/target:exe', `/out:${target}`, sourcePath], { windowsHide: true });
  if (invalidUpdate) await fs.writeFile(download, 'verified but invalid executable');
  else await execFileAsync(compiler, ['/nologo', '/target:exe', '/define:UPDATED', `/out:${download}`, sourcePath], { windowsHide: true });
  const userData = path.join(directory, 'data');
  await fs.mkdir(userData);
  const environment = { ...process.env, MATRIX_INSTALL_TEST_ROOT: directory, PORTABLE_EXECUTABLE_FILE: target,
    PORTABLE_EXECUTABLE_DIR: directory };
  const launcher = spawnProcess(target, ['--launcher'], { env: environment, windowsHide: true, stdio: 'ignore' });
  let main;
  if (!nestedHelper) main = spawnProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' });
  children.push(launcher);
  if (main) children.push(main);
  await waitForFile(path.join(directory, 'launcher-ready'));
  const installer = new PortableInstaller({
    app: { isPackaged: true, getPath: () => userData }, environment,
    processId: main?.pid, launcherPid: launcher.pid,
    spawn: (command, args, options) => {
      const child = spawnProcess(command, args, options);
      children.push(child);
      return child;
    },
  });
  const update = { filePath: download, sha256: hash(await fs.readFile(download)), size: (await fs.stat(download)).size };
  const prepare = async () => {
    try {
      if (nestedHelper) {
        // This process is the real parent of the PowerShell helper and exits before replacement.
        const runnerPath = path.join(directory, 'caller.mjs');
        const installerUrl = new URL('../../../src/main/services/updates/PortableInstaller.js', import.meta.url).href;
        await fs.writeFile(runnerPath, `
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PortableInstaller } from ${JSON.stringify(installerUrl)};
const directory = ${JSON.stringify(directory)};
const installer = new PortableInstaller({
  app: { isPackaged: true, getPath: () => ${JSON.stringify(userData)} },
  launcherPid: ${launcher.pid}, exitTimeoutMs: 15000,
});
try {
  await installer.prepare(${JSON.stringify(update)});
  await fs.writeFile(path.join(directory, 'parent-ready'), 'ready');
  while (true) {
    try { await fs.access(path.join(directory, 'stop-parent')); break; } catch {}
    await delay(50);
  }
  process.exit(0);
} catch (error) {
  await fs.writeFile(path.join(directory, 'parent-error'), String(error.stack));
  process.exit(1);
}
`);
        main = spawnProcess(process.execPath, [runnerPath], { env: environment, windowsHide: true, stdio: 'ignore' });
        children.push(main);
        await waitForFile(path.join(directory, 'parent-ready'));
      } else {
        assert.equal(await installer.prepare(update), true);
      }
    }
    catch (error) {
      const [runDirectory] = await fs.readdir(path.join(userData, 'updates'));
      const runPath = path.join(userData, 'updates', runDirectory);
      t.diagnostic(JSON.stringify(await fs.readdir(runPath)));
      t.diagnostic(await fs.readFile(path.join(runPath, 'install.log'), 'utf8').catch(() => 'no log'));
      throw error;
    }
    const [runDirectory] = await fs.readdir(path.join(userData, 'updates'));
    config = JSON.parse(await fs.readFile(path.join(userData, 'updates', runDirectory, 'install.json'), 'utf8'));
    return config;
  };
  return { directory, target, download, get main() { return main; }, launcher, prepare };
}

test('real Windows helper waits for launcher cleanup, replaces the same EXE, and clears portable environment on restart',
  { skip: process.platform !== 'win32', timeout: 30000 }, async (t) => {
    const f = await executableFixture(t);
    const oldBytes = await fs.readFile(f.target);
    const config = await f.prepare();
    f.main.kill();
    await delay(400);
    assert.deepEqual(await fs.readFile(f.target), oldBytes);
    await fs.writeFile(path.join(f.directory, 'stop-launcher'), 'stop');
    assert.equal(await waitForFile(path.join(f.directory, 'run-new')), 'cleaned|cleared|cleared');
    assert.equal(await waitForFile(config.successPath), 'complete');
    assert.deepEqual(await fs.readFile(f.target), await fs.readFile(f.download));
    assert.deepEqual(await fs.readFile(config.backupPath), oldBytes);
  });

test('real Windows helper rejects post-handshake tampering and restarts the untouched original',
  { skip: process.platform !== 'win32', timeout: 30000 }, async (t) => {
    const f = await executableFixture(t);
    const oldBytes = await fs.readFile(f.target);
    const config = await f.prepare();
    await fs.writeFile(config.candidatePath, 'tampered after ready');
    f.main.kill();
    await fs.writeFile(path.join(f.directory, 'stop-launcher'), 'stop');
    assert.match(await waitForFile(config.errorPath), /SHA-256|size/);
    assert.equal(await waitForFile(path.join(f.directory, 'run-old')), 'cleaned|cleared|cleared');
    assert.deepEqual(await fs.readFile(f.target), oldBytes);
    await assert.rejects(fs.access(path.join(f.directory, 'run-new')));
    await assert.rejects(fs.access(config.candidatePath));
  });

test('real Windows helper survives its actual caller exiting before the portable launcher',
  { skip: process.platform !== 'win32', timeout: 30000 }, async (t) => {
    const f = await executableFixture(t, { nestedHelper: true });
    const config = await f.prepare();
    const parentExited = new Promise((resolve) => f.main.once('exit', resolve));
    await fs.writeFile(path.join(f.directory, 'stop-parent'), 'stop');
    assert.equal(await parentExited, 0);
    await fs.writeFile(path.join(f.directory, 'stop-launcher'), 'stop');
    assert.equal(await waitForFile(path.join(f.directory, 'run-new')), 'cleaned|cleared|cleared');
    assert.equal(await waitForFile(config.successPath), 'complete');
  });

test('real Windows helper rolls back when the verified new executable cannot start',
  { skip: process.platform !== 'win32', timeout: 30000 }, async (t) => {
    const f = await executableFixture(t, { invalidUpdate: true });
    const oldBytes = await fs.readFile(f.target);
    const config = await f.prepare();
    f.main.kill();
    await fs.writeFile(path.join(f.directory, 'stop-launcher'), 'stop');
    assert.ok(await waitForFile(config.errorPath));
    assert.equal(await waitForFile(path.join(f.directory, 'run-old')), 'cleaned|cleared|cleared');
    assert.deepEqual(await fs.readFile(f.target), oldBytes);
    assert.match(await fs.readFile(config.logPath, 'utf8'), /Original executable restored/);
  });
