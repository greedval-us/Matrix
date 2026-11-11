import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import test from 'node:test';

function publicationGit(directory, args, input) {
  const result = spawnSync('git', ['-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', '-c', 'user.name=Publication Test', '-c', 'user.email=publication@example.invalid', ...args], { cwd: directory, input, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function publicationCheck(directory, ...args) {
  const result = spawnSync(process.execPath, [checker, ...args], { cwd: directory, encoding: 'utf8' });
  assert.ifError(result.error);
  return { ...result, output: result.stdout + result.stderr };
}

const checker = fileURLToPath(new URL('../../../scripts/checkPublication.mjs', import.meta.url));
const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ9sAAAAASUVORK5CYII=', 'base64');

function pngWithText(type, metadata) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(metadata.length);
  const content = Buffer.concat([Buffer.from(type), metadata]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([onePixelPng.subarray(0, -12), length, content, checksum, onePixelPng.subarray(-12)]);
}

async function repository(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-source-export-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
  await fs.writeFile(path.join(directory, '.gitignore'), 'output/\n.env\nnode_modules/\n');
  await fs.writeFile(path.join(directory, 'README.md'), 'Use localhost:50051.\n');
  return directory;
}

test('publication check scans eligible files, includes tracked ignored files and prints locations without contents', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-publication-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: directory }).status, 0);
  await fs.writeFile(path.join(directory, '.gitignore'), '.env\noutput/\n*.crt\n');
  await fs.writeFile(path.join(directory, 'README.md'), 'Use localhost:50051 and https://nodejs.org/.\n');
  await fs.writeFile(path.join(directory, '.env'), 'LOCAL_SECRET=ignored-value\n');
  await fs.mkdir(path.join(directory, 'output'));
  await fs.writeFile(path.join(directory, 'output', 'local.txt'), 'not a publish candidate\n');

  const clean = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);

  const privateEndpoint = ['192', '168', '42', '23'].join('.');
  const personalPath = ['C:', 'Users', 'local-person', 'private'].join('/');
  await fs.writeFile(path.join(directory, 'connection.js'), `const endpoint = "${privateEndpoint}:50051";\nconst path = "${personalPath}";\n`);
  await fs.writeFile(path.join(directory, 'server.crt'), 'private deployment certificate fixture\n');
  assert.equal(spawnSync('git', ['add', '--force', 'server.crt'], { cwd: directory }).status, 0);
  const unsafe = spawnSync(process.execPath, [checker], { cwd: directory, encoding: 'utf8' });
  assert.equal(unsafe.status, 1, unsafe.stderr);
  assert.match(unsafe.stdout, /connection\.js:1.*private network address/);
  assert.match(unsafe.stdout, /connection\.js:2.*personal machine path/);
  assert.match(unsafe.stdout, /server\.crt:1.*local certificate or key/);
  assert.doesNotMatch(unsafe.stdout, /192\.168\.42\.23|local-person|ignored-value|private deployment/);
  assert.doesNotMatch(unsafe.stdout, /output\/local\.txt|\.env:/);
});

test('a clean source export includes publish candidates without history, ignored secrets or dependencies', async (t) => {
  const directory = await repository(t);
  await fs.mkdir(path.join(directory, 'src'));
  await fs.writeFile(path.join(directory, 'src', 'app.js'), 'export const ready = true;\n');
  await fs.writeFile(path.join(directory, 'package-lock.json'), '{"name":"source-export"}\n');
  await fs.writeFile(path.join(directory, '.env.example'), 'API_KEY=replace-me\n');
  await fs.mkdir(path.join(directory, 'docs'));
  await fs.writeFile(path.join(directory, 'docs', 'architecture.md'), 'Useful public documentation\n');
  await fs.writeFile(path.join(directory, 'docs', 'refactoring-plan.md'), 'Local implementation plan\n');
  await fs.writeFile(path.join(directory, '.env'), 'SECRET=not-for-export\n');
  await fs.mkdir(path.join(directory, 'node_modules'));
  await fs.writeFile(path.join(directory, 'node_modules', 'dependency.js'), 'ignored dependency\n');

  const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const target = path.join(directory, 'output', 'publication');
  assert.equal(await fs.readFile(path.join(target, 'src', 'app.js'), 'utf8'), 'export const ready = true;\n');
  assert.equal(await fs.readFile(path.join(target, 'package-lock.json'), 'utf8'), '{"name":"source-export"}\n');
  assert.deepEqual((await fs.readdir(target)).sort(), ['.env.example', '.gitignore', 'README.md', 'docs', 'package-lock.json', 'src']);
  assert.deepEqual(await fs.readdir(path.join(target, 'docs')), ['architecture.md']);
});

test('source export refuses unsafe targets, existing folders and failed audits before writing', async (t) => {
  const directory = await repository(t);
  for (const target of ['src', '../outside-export', 'output/../src', 'output/.git']) {
    const result = spawnSync(process.execPath, [checker, `--export=${target}`], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /export target/i);
  }
  await fs.mkdir(path.join(directory, 'output', 'existing'), { recursive: true });
  await fs.writeFile(path.join(directory, 'output', 'existing', 'keep.txt'), 'keep this data');
  const existing = spawnSync(process.execPath, [checker, '--export=output/existing'], { cwd: directory, encoding: 'utf8' });
  assert.equal(existing.status, 1);
  assert.equal(await fs.readFile(path.join(directory, 'output', 'existing', 'keep.txt'), 'utf8'), 'keep this data');

  const privateEndpoint = ['192', '168', '42', '23'].join('.');
  await fs.writeFile(path.join(directory, 'unsafe.txt'), privateEndpoint);
  const unsafe = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(unsafe.status, 1);
  await assert.rejects(fs.access(path.join(directory, 'output', 'publication')), { code: 'ENOENT' });
});

test('source export blocks deployment identifiers in a candidate filename', async (t) => {
  const directory = await repository(t);
  const filename = 'laptop-' + 'abcdef.png';
  await fs.writeFile(path.join(directory, filename), 'fixture');
  const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`${filename}:1: deployment hostname`));
  await assert.rejects(fs.access(path.join(directory, 'output', 'publication')), { code: 'ENOENT' });
});

test('source export blocks identifying compressed PNG text metadata', async (t) => {
  const directory = await repository(t);
  await fs.mkdir(path.join(directory, 'src', 'public'), { recursive: true });
  const personalPath = ['C:', 'Users', 'local-person', 'private'].join('/');
  const metadata = Buffer.concat([Buffer.from('Comment\0\0'), deflateSync(personalPath)]);
  await fs.writeFile(path.join(directory, 'src', 'public', 'logo.png'), pngWithText('zTXt', metadata));
  const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /src\/public\/logo\.png:1: personal machine path/);
  assert.doesNotMatch(result.stdout, /local-person/);
  await assert.rejects(fs.access(path.join(directory, 'output', 'publication')), { code: 'ENOENT' });
});

test('deleted tracked deployment-named files are absent from the current publication audit', async (t) => {
  const directory = await repository(t);
  const filename = 'laptop-' + 'abcdef.crt';
  await fs.writeFile(path.join(directory, filename), 'deployment fixture');
  assert.equal(spawnSync('git', ['add', filename], { cwd: directory }).status, 0);
  await fs.unlink(path.join(directory, filename));
  const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!result.stdout.includes(`${filename}:`));
  await assert.rejects(fs.access(path.join(directory, 'output', 'publication', filename)), { code: 'ENOENT' });
});

test('binary asset checks detect plain UTF8 and UTF16 identifying text', async (t) => {
  const personalPath = ['C:', 'Users', 'local-person', 'private'].join('/');
  const utf16 = Buffer.from(personalPath, 'utf16le');
  for (const bytes of [Buffer.from(personalPath), utf16, Buffer.from(utf16).swap16()]) {
    const directory = await repository(t);
    await fs.mkdir(path.join(directory, 'src', 'public'), { recursive: true });
    await fs.writeFile(path.join(directory, 'src', 'public', 'logo.png'), Buffer.concat([onePixelPng, Buffer.from([1]), bytes]));
    const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stdout, /personal machine path/);
    await assert.rejects(fs.access(path.join(directory, 'output', 'publication')), { code: 'ENOENT' });
  }
});

test('legitimate image text metadata is preserved and oversized compressed metadata is rejected', async (t) => {
  const directory = await repository(t);
  await fs.mkdir(path.join(directory, 'src', 'public'), { recursive: true });
  const source = pngWithText('zTXt', Buffer.concat([Buffer.from('License\0\0'), deflateSync('CC0 artwork provenance')]));
  const filename = path.join(directory, 'src', 'public', 'logo.png');
  await fs.writeFile(filename, source);
  const clean = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(clean.status, 0, clean.stderr);
  assert.deepEqual(await fs.readFile(path.join(directory, 'output', 'publication', 'src', 'public', 'logo.png')), source);
  await fs.writeFile(filename, pngWithText('zTXt', Buffer.concat([Buffer.from('Comment\0\0'), deflateSync('x'.repeat(1024 * 1024 + 1))])));
  const oversized = spawnSync(process.execPath, [checker, '--export=output/oversized'], { cwd: directory, encoding: 'utf8' });
  assert.equal(oversized.status, 1);
  assert.match(oversized.stdout, /image text metadata requires separate review/);
  await assert.rejects(fs.access(path.join(directory, 'output', 'oversized')), { code: 'ENOENT' });
});

test('source export rejects a tracked file reached through an ancestor junction or symlink', async (t) => {
  const directory = await repository(t);
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-outside-export-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, 'src'));
  await fs.writeFile(path.join(directory, 'src', 'note.txt'), 'original source');
  assert.equal(spawnSync('git', ['add', 'src/note.txt'], { cwd: directory }).status, 0);
  await fs.rename(path.join(directory, 'src'), path.join(directory, 'original-src'));
  await fs.writeFile(path.join(outside, 'note.txt'), 'outside repository content');
  await fs.symlink(outside, path.join(directory, 'src'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.appendFile(path.join(directory, '.gitignore'), 'src/\n');
  const result = spawnSync(process.execPath, [checker, '--export=output/publication'], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /src\/note\.txt:1: .*link|src\/note\.txt:1: .*outside/);
  await assert.rejects(fs.access(path.join(directory, 'output', 'publication')), { code: 'ENOENT' });
});

test('staged publication reads the complete index even after working-tree content changes or disappears', async t => {
  const directory = await repository(t);
  const endpoint = ['192', '168', '42', '23'].join('.');
  await fs.writeFile(path.join(directory, 'connection.js'), `export const endpoint = '${endpoint}';\n`);
  publicationGit(directory, ['add', '.']);
  publicationGit(directory, ['commit', '--quiet', '-m', 'existing unsafe fixture']);
  for (const state of ['clean', 'missing']) {
    if (state === 'clean') await fs.writeFile(path.join(directory, 'connection.js'), 'export const endpoint = "localhost";\n');
    else await fs.unlink(path.join(directory, 'connection.js'));
    const result = publicationCheck(directory, '--staged');
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /connection\.js:1: private network address/);
    assert.ok(!result.output.includes(endpoint));
  }
  publicationGit(directory, ['rm', '--cached', '--', 'connection.js']);
  assert.equal(publicationCheck(directory, '--staged').status, 0);
});

test('reference publication checks committed bytes and rejects invalid or incompatible options', async t => {
  const directory = await repository(t);
  const endpoint = ['192', '168', '42', '23'].join('.');
  await fs.writeFile(path.join(directory, 'connection.js'), endpoint);
  publicationGit(directory, ['add', '.']);
  publicationGit(directory, ['commit', '--quiet', '-m', 'fixture']);
  await fs.writeFile(path.join(directory, 'connection.js'), 'localhost');
  const result = publicationCheck(directory, '--ref=HEAD');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /connection\.js:1: private network address/);
  assert.ok(!result.output.includes(endpoint));
  for (const args of [['--ref='], ['--ref=missing'], ['--ref=--all'], ['--ref=HEAD^{tree}'], ['--ref=HEAD', '--staged'], ['--ref=HEAD', '--export=output/no'], ['--staged', '--staged']]) {
    assert.equal(publicationCheck(directory, ...args).status, 1, args.join(' '));
  }
});

test('Git snapshot checks refuse symlinks, gitlinks and unresolved index entries', async t => {
  const directory = await repository(t);
  publicationGit(directory, ['add', '.']);
  publicationGit(directory, ['commit', '--quiet', '-m', 'fixture']);
  const blob = publicationGit(directory, ['hash-object', '-w', '--stdin'], 'external-target');
  const commit = publicationGit(directory, ['rev-parse', 'HEAD']);
  publicationGit(directory, ['update-index', '--add', '--cacheinfo', `120000,${blob},linked-file`]);
  publicationGit(directory, ['update-index', '--add', '--cacheinfo', `160000,${commit},nested-repository`]);
  let result = publicationCheck(directory, '--staged');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /linked-file:1: symbolic link/);
  assert.match(result.output, /nested-repository:1: .*gitlink|nested-repository:1: .*submodule/);
  publicationGit(directory, ['commit', '--quiet', '-m', 'unsupported entries']);
  result = publicationCheck(directory, '--ref=HEAD');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /linked-file:1: symbolic link/);
  assert.match(result.output, /nested-repository:1: .*gitlink|nested-repository:1: .*submodule/);
  publicationGit(directory, ['update-index', '--index-info'], `100644 ${blob} 1\tunresolved.js\n100644 ${blob} 2\tunresolved.js\n`);
  result = publicationCheck(directory, '--staged');
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /unresolved\.js:1: unresolved index/);
});

test('forced private, generated and planning paths fail while templates and migrations remain publishable', async t => {
  const directory = await repository(t);
  const privatePaths = [
    'nested/.npmrc', 'nested/.aws/credentials', 'nested/.ssh/known_hosts', 'runtime.env', 'password.hash',
    'db-password', 'tls/id_rsa.pub', 'tls/server.der', '.claude/settings.json', '.codebase-memory/index.json',
    'docs/implementation-plan.md', 'diagnostic.log', 'backup.zip', 'database.sqlite', 'runtime/operations.txt',
    '.worktrees/feature/source.js', '.idea/workspace.xml', '.nyc_output/coverage.json',
    'test-results/report.json', 'playwright-report/index.html', 'generated/protocol.js',
    '.vscode/local-session.json', 'nested/.vscode/history/session.json',
  ];
  for (const filename of privatePaths) {
    await fs.mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await fs.writeFile(path.join(directory, filename), 'local fixture\n');
  }
  publicationGit(directory, ['add', '--force', '--', ...privatePaths]);
  const result = publicationCheck(directory, '--staged');
  assert.equal(result.status, 1, result.output);
  for (const filename of privatePaths) assert.ok(result.output.includes(`${filename}:1:`), filename);
  const worktree = publicationCheck(directory);
  assert.equal(worktree.status, 1, worktree.output);
  for (const filename of privatePaths) assert.ok(worktree.output.includes(`${filename}:1:`), filename);
  publicationGit(directory, ['rm', '--cached', '--', ...privatePaths]);
  for (const filename of ['.env.example', 'nested/.env.worker.sample', 'migrations/001_schema.sql', 'templates/compose.yaml', '.vscode/settings.json', '.vscode/extensions.json', '.vscode/launch.json', '.vscode/tasks.json']) {
    await fs.mkdir(path.dirname(path.join(directory, filename)), { recursive: true });
    await fs.writeFile(path.join(directory, filename), 'portable fixture\n');
    publicationGit(directory, ['add', '--force', '--', filename]);
  }
  const clean = publicationCheck(directory, '--staged');
  assert.equal(clean.status, 0, clean.output);
});
