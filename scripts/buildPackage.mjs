import { X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'electron-builder';
import { BUNDLED_CA_FILENAME } from '../src/shared/constants/serverConfig.js';

const [mode, caPath, ...extraArgs] = process.argv.slice(2);
const targets = {
  default: {},
  win: { win: ['nsis', 'portable'] },
  linux: { linux: ['AppImage'] },
  portable: { win: ['portable:x64'] },
};
if (!Object.hasOwn(targets, mode) || !caPath || extraArgs.length) {
  throw new Error('Pass one public CA certificate: npm run build:portable -- /path/to/server-ca.crt');
}

const source = path.resolve(caPath);
const pem = (await readFile(source, 'utf8')).trim();
const singleCertificate = /^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----$/;
if (!singleCertificate.test(pem) || !new X509Certificate(pem).ca) {
  throw new Error('The build requires one public PEM CA certificate.');
}

const { version, build: packaging } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const config = {
  ...packaging,
  extraResources: [...(packaging.extraResources || []), { from: source, to: BUNDLED_CA_FILENAME }],
};
if (mode === 'portable') {
  config.directories = { ...packaging.directories, output: `dist/portable-${version}` };
}

await build({ ...targets[mode], config, publish: 'never' });
