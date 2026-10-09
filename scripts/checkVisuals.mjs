import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import { IPC_CHANNELS as channels } from '../src/shared/constants/ipcChannels.js';
import { DEFAULT_SERVER_CONFIG } from '../src/shared/constants/serverConfig.js';

// This harness renders fixture data only. It never opens the application's store or server.
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectDirectory, 'output', 'visuals');
mkdirSync(outputDirectory, { recursive: true });
const progressPath = path.join(outputDirectory, 'harness.progress.log');
writeFileSync(progressPath, '');
function progress(message) {
  appendFileSync(progressPath, `${new Date().toISOString()} ${message}\n`);
}
progress(`bootstrap pid=${process.pid}`);
writeFileSync(path.join(outputDirectory, 'report.json'), JSON.stringify({ passed: null, status: 'running', fixtureData: true }));
const temporaryUserData = mkdtempSync(path.join(os.tmpdir(), 'matrix-visual-check-'));
app.setPath('userData', temporaryUserData);
app.commandLine.appendSwitch('disable-background-networking');
app.disableHardwareAcceleration();

const VIEWPORT = { width: 1200, height: 760 };
const MINIMUM_WINDOW = { width: 820, height: 560 };
const WAIT_TIMEOUT_MS = 8000;
const TRANSITION_SETTLE_MS = 420;
const fixtureStatus = { status: 'ready', indexed_shards: 12, total_shards: 12, progress_percent: 100 };
const collections = { notes: [], tasks: [], history: [] };
let fixtureConfig = { ...DEFAULT_SERVER_CONFIG, endpoint: 'preview.invalid:50051', hasApiKey: true };
const sessions = new Set();
const handledChannels = [];
const rendererErrors = [];
const screenshots = [];
const checks = [];
const primaryAccents = {};
const logoSource = readFileSync(path.join(projectDirectory, 'src', 'public', 'matrix.png'));
const expectedLogoSize = { width: logoSource.readUInt32BE(16), height: logoSource.readUInt32BE(20) };
let sidebarLogo;
let splashDetails;
let window;
let failure;
let measuredMinimumViewport;

function handle(channel, callback) {
  ipcMain.handle(channel, callback);
  handledChannels.push(channel);
}

function fixtureItem(data) {
  return { id: randomUUID(), ...data, createdAt: '2026-10-09T09:00:00.000Z' };
}

function registerFixtureApis() {
  for (const key of Object.keys(collections)) {
    const collectionChannels = channels.store[key];
    handle(collectionChannels.get, () => collections[key]);
    handle(collectionChannels.delete, (_event, id) => {
      collections[key] = collections[key].filter(item => item.id !== id);
      return true;
    });
  }
  handle(channels.store.notes.add, (_event, text) => {
    const note = fixtureItem({ text });
    collections.notes.push(note);
    return note;
  });
  handle(channels.store.notes.update, (_event, { id, text }) => {
    const note = collections.notes.find(item => item.id === id);
    if (note) note.text = text;
    return true;
  });
  handle(channels.store.tasks.add, (_event, data) => {
    const task = fixtureItem({ ...data, done: false });
    collections.tasks.push(task);
    return task;
  });
  handle(channels.store.tasks.update, (_event, { id, ...data }) => {
    Object.assign(collections.tasks.find(item => item.id === id) || {}, data);
    return true;
  });
  handle(channels.store.tasks.toggle, (_event, id) => {
    const task = collections.tasks.find(item => item.id === id);
    if (task) task.done = !task.done;
    return true;
  });
  handle(channels.store.history.add, (_event, data) => {
    const item = fixtureItem(data);
    collections.history.unshift(item);
    return item;
  });
  handle(channels.store.history.clear, () => { collections.history = []; return true; });
  handle(channels.store.get, (_event, key) => collections[key]);
  handle(channels.store.has, (_event, key) => Object.hasOwn(collections, key));
  handle(channels.store.set, (_event, { key, value }) => {
    assert.ok(Object.hasOwn(collections, key));
    collections[key] = value;
  });
  handle(channels.store.delete, (_event, key) => {
    assert.ok(Object.hasOwn(collections, key));
    collections[key] = [];
  });
  handle(channels.store.clear, () => { for (const key of Object.keys(collections)) collections[key] = []; });
  handle(channels.search.getConfig, () => fixtureConfig);
  handle(channels.search.setConfig, (_event, config) => {
    fixtureConfig = { ...fixtureConfig, ...config, apiKey: '', hasApiKey: true };
    return fixtureConfig;
  });
  handle(channels.search.testConnection, () => fixtureStatus);
  handle(channels.search.getIndexStatus, () => fixtureStatus);
  handle(channels.search.createClient, (_event, tabId) => { sessions.add(tabId); return fixtureStatus; });
  handle(channels.search.destroyClient, (_event, tabId) => { sessions.delete(tabId); return true; });
  handle(channels.search.listDatabases, () => [
    { name_table: 'visual_fixture', name: 'Демонстрационный каталог', type: 'Контакты',
      info: 'Искусственные записи для проверки интерфейса.', relevance_date: '2026', count: '24000', trust: '1' },
    { name_table: 'visual_archive', name: 'Тестовый архив', type: 'Архив',
      info: 'Пример недоступного источника.', relevance_date: '2025', count: '1800', trust: '0' },
  ]);
  handle(channels.search.run, (event, tabId, query) => {
    assert.ok(sessions.has(tabId), 'Search must create its session before running');
    assert.ok(query.number, 'The fixture search must contain its phone field');
    const source = 'visual_fixture';
    const items = [
      { object_data_base: { name_table: source, name: 'Демонстрационный каталог', type: 'Контакты',
        country: 'Тестовые данные', relevance_date: '2026', trust: '1', count: '24000',
        info: 'Искусственные записи для проверки интерфейса. Реальный сервер не используется.' } },
      { object_data: { source_name: source, fields: {
        id: 'fixture-1', fio: 'Пример Алексей Сергеевич', number: query.number,
        mail: 'alexey@example.test', date_of_birth: '14.06.1992',
      } } },
      { object_data: { source_name: source, fields: {
        id: 'fixture-2', fio: 'Пример Мария Андреевна', number: query.number, mail: 'maria@example.test',
      } } },
    ];
    event.sender.send(channels.search.progress, { tabId, type: 'chunk', items, received: items.length });
    return { took_ms: 124, received: items.length, partial: false, ...fixtureStatus };
  });
  ipcMain.on(channels.search.cancel, cancelFixtureSearch);
  for (const channel of Object.values(channels.dialog)) handle(channel, () => null);
  handle(channels.file.read, () => '');
  handle(channels.file.write, () => true);
}

function cancelFixtureSearch() {}

const pause = duration => new Promise(resolve => setTimeout(resolve, duration));
const evaluateIn = (contents, callback, ...args) => contents.executeJavaScript(
  `(${callback.toString()})(...${JSON.stringify(args)})`, true,
);
const evaluate = (callback, ...args) => evaluateIn(window.webContents, callback, ...args);

async function waitFor(callback, ...args) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await evaluate(callback, ...args);
    if (value) return value;
    await pause(50);
  }
  throw new Error(`Timed out waiting for renderer condition: ${callback.toString()}`);
}

async function click(selector) {
  await waitFor(selector => Boolean(document.querySelector(selector)), selector);
  await evaluate(selector => {
    const element = document.querySelector(selector);
    if (element.disabled) throw new Error(`Control disabled: ${selector}`);
    element.focus();
    element.click();
  }, selector);
  await pause(TRANSITION_SETTLE_MS);
}

async function navigate(route) {
  await evaluate(route => { location.hash = route; }, route);
  await waitFor(() => document.querySelector('#main-content')?.children.length > 0);
  await pause(TRANSITION_SETTLE_MS);
}

async function assertNoHorizontalOverflow(label) {
  const geometry = await evaluate(() => ['html', 'body', '#main-content'].map(selector => {
    const element = document.querySelector(selector);
    return { selector, width: element.clientWidth, contentWidth: element.scrollWidth };
  }));
  for (const { selector, width, contentWidth } of geometry) {
    assert.ok(contentWidth <= width + 1, `${label}: ${selector} overflows by ${contentWidth - width}px`);
  }
  checks.push(`${label}: no horizontal overflow`);
}

async function checkPrimaryAccent(appearance) {
  const colors = await evaluate(() => {
    const button = document.querySelector('.mx-button-primary');
    if (!button) throw new Error('Primary action must be present to inspect the accent');
    const style = getComputedStyle(button);
    return { background: style.backgroundColor, foreground: style.color };
  });
  const [red, green, blue] = colors.background.match(/[\d.]+/g).map(Number);
  assert.ok(green > red && green > blue, `${appearance}: primary action must retain the green Matrix accent`);
  primaryAccents[appearance] = colors;
  checks.push(`${appearance}: green primary accent ${colors.background}`);
}

async function capture(name) {
  progress(`capture ${name}`);
  await pause(TRANSITION_SETTLE_MS);
  await assertNoHorizontalOverflow(name);
  await captureSurface(window.webContents, name);
}

async function captureSurface(contents, name) {
  // Offscreen rendering keeps frame production active. Two animation frames flush Vue/CSS changes
  // before Chromium captures the current surface, even though no native window is visible.
  await evaluateIn(contents, async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const { data } = await contents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  });
  assert.ok(data.length > 0, `Screenshot ${name} must have pixels`);
  const filename = `${name}.png`;
  await writeFile(path.join(outputDirectory, filename), Buffer.from(data, 'base64'));
  screenshots.push({ filename, fixtureData: true,
    viewport: await evaluateIn(contents, () => ({ width: innerWidth, height: innerHeight })) });
}

async function checkCinematicSplash() {
  const splashErrors = [];
  const splash = new BrowserWindow({
    width: 400, height: 300, useContentSize: true, transparent: true, frame: false, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, offscreen: true },
  });
  try {
    progress('loading-cinematic-splash');
    splash.webContents.on('console-message', details => {
      if (details.level === 'error') splashErrors.push(details.message);
    });
    splash.webContents.debugger.attach('1.3');
    splash.webContents.setFrameRate(30);
    await splash.loadFile(path.join(projectDirectory, 'src', 'public', 'splash.html'));
    await splash.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 400, height: 300, deviceScaleFactor: await evaluateIn(splash.webContents, () => devicePixelRatio), mobile: false,
    });
    // Give the falling glyphs and logo entrance enough time to produce a representative frame.
    await pause(1200);
    splashDetails = await evaluateIn(splash.webContents, () => {
      const logo = document.querySelector('img');
      const canvas = document.querySelector('canvas');
      let greenPixels = 0;
      if (canvas) {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const [red, green, blue, alpha] = pixels.subarray(offset, offset + 4);
          if (alpha > 0 && green > 40 && green > red * 1.3 && green > blue * 1.3) greenPixels++;
        }
      }
      return { title: document.title, logoLoaded: Boolean(logo?.complete && logo.naturalWidth),
        logoSize: { width: logo?.naturalWidth, height: logo?.naturalHeight },
        canvasPresent: Boolean(canvas), greenPixels };
    });
    assert.match(splashDetails.title, /Matrix/i);
    assert.ok(splashDetails.logoLoaded, 'Cinematic splash must load the actual Matrix logo');
    assert.deepEqual(splashDetails.logoSize, expectedLogoSize, 'Splash must use the project Matrix PNG');
    assert.ok(splashDetails.canvasPresent && splashDetails.greenPixels > 100,
      'Cinematic splash canvas must render green Matrix rain glyphs');
    assert.deepEqual(splashErrors, [], 'Splash must not log runtime errors');
    splashDetails.consoleErrors = splashErrors;
    await captureSurface(splash.webContents, 'splash-matrix-rain');
    checks.push('Cinematic splash: Matrix title, actual logo loaded, green rain canvas, no runtime errors');
  } finally {
    if (splash.webContents.debugger.isAttached()) splash.webContents.debugger.detach();
    splash.webContents.removeAllListeners('console-message');
    splash.destroy();
  }
}

async function runVisualChecks() {
  await waitFor(() => document.querySelector('h1')?.textContent.includes('Рабочее пространство'));
  await waitFor(() => !document.body.textContent.includes('Загружаем рабочее пространство'));
  sidebarLogo = await waitFor(() => {
    const logo = document.querySelector('.sidebar-brand img');
    return logo?.complete && logo.naturalWidth
      ? { width: logo.naturalWidth, height: logo.naturalHeight, source: logo.currentSrc } : false;
  });
  assert.deepEqual({ width: sidebarLogo.width, height: sidebarLogo.height }, expectedLogoSize,
    'Sidebar must load the actual Matrix PNG instead of a generated icon');
  checks.push('Sidebar: actual Matrix PNG loaded with expected natural dimensions');
  assert.equal(await evaluate(() => document.documentElement.dataset.appearance), 'light');
  await checkPrimaryAccent('light');
  await capture('home-light');

  const sidebarWidth = () => document.querySelector('.app-sidebar').getBoundingClientRect().width;
  const expandedWidth = await evaluate(sidebarWidth);
  progress(`sidebar expanded width=${expandedWidth}`);
  await click('header.app-toolbar button[aria-label="Свернуть меню"]');
  const collapsedWidth = await evaluate(sidebarWidth);
  progress(`sidebar collapsed width=${collapsedWidth}`);
  assert.ok(collapsedWidth < expandedWidth / 2, 'Sidebar collapse must release content space');
  await assertNoHorizontalOverflow('sidebar-collapsed');
  await click('header.app-toolbar button[aria-label="Развернуть меню"]');
  await waitFor(expected => Math.abs(document.querySelector('.app-sidebar').getBoundingClientRect().width - expected) <= 1,
    expandedWidth);
  checks.push(`Sidebar: ${Math.round(expandedWidth)}px expanded / ${Math.round(collapsedWidth)}px collapsed`);

  const modalButton = 'button[aria-label="Добавить заметку"]';
  await click(modalButton);
  await waitFor(() => document.querySelector('dialog')?.open);
  assert.equal(await evaluate(() => document.activeElement?.tagName), 'TEXTAREA');
  await capture('note-dialog-light');
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  const dialogLeave = await waitFor(() => {
    const dialog = document.querySelector('dialog');
    return dialog?.classList.contains('dialog-leave-active') ? { open: dialog.open } : false;
  });
  assert.equal(dialogLeave.open, true, 'Native dialog must remain open during its leave transition');
  await window.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
  });
  await waitFor(() => !document.querySelector('dialog'));
  assert.equal(await evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Добавить заметку');
  checks.push('Note dialog: autofocus, native Escape, open throughout leave transition, focus restored');

  await navigate('/search');
  await waitFor(() => document.querySelectorAll('.search-field-option').length >= 4);
  await evaluate(() => {
    const phoneButton = [...document.querySelectorAll('.search-field-option')]
      .find(button => button.textContent.trim() === 'Телефон');
    if (!phoneButton) throw new Error('Primary field selector must expose phone');
    phoneButton.click();
  });
  await waitFor(() => Boolean(document.querySelector('input[id$="-number"]')));
  await click('.search-fields-disclosure');
  assert.equal(await evaluate(() => document.querySelector('.search-fields-disclosure').getAttribute('aria-expanded')), 'true');
  await evaluate(() => {
    const passportButton = [...document.querySelectorAll('.search-field-option')]
      .find(button => button.textContent.trim() === 'Паспорт');
    if (!passportButton) throw new Error('Additional field selector must expose passport');
    passportButton.click();
  });
  await waitFor(() => Boolean(document.querySelector('input[id$="-passport"]')));
  await click('button[aria-label="Удалить поле Паспорт"]');
  await waitFor(() => !document.querySelector('input[id$="-passport"]'));
  await click('.search-fields-disclosure');
  checks.push('Query fields: progressive disclosure, add/remove additional field');
  await evaluate(() => {
    const input = document.querySelector('input[id$="-number"]');
    input.value = '79000000000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('.search-primary-action');
  await waitFor(() => document.body.textContent.includes('Запрос завершён') &&
    document.querySelectorAll('article[data-base-name] .mx-record').length === 2);
  assert.equal(sessions.size, 0, 'Search session must be disposed after success');
  await capture('search-light');

  await navigate('/settings');
  await waitFor(() => Boolean([...document.querySelectorAll('input')].find(input => input.value === 'preview.invalid:50051')));
  await capture('settings-light');
  await navigate('/database');
  await waitFor(() => document.querySelectorAll('tbody tr').length === 2);
  await capture('catalogue-light');
  await navigate('/package-search');
  await waitFor(() => document.querySelector('textarea')?.placeholder === 'Каждое значение — с новой строки');
  await evaluate(() => {
    const input = document.querySelector('textarea');
    input.value = '79000000000\n79000000001';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await waitFor(() => document.body.textContent.includes('2 запросов'));
  await capture('batch-light');
  await navigate('/info');
  await waitFor(() => document.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') === '100');
  await capture('info-light');
  await click('button[aria-label="Включить тёмную тему"]');
  assert.equal(await evaluate(() => document.documentElement.dataset.appearance), 'dark');
  assert.equal(await evaluate(() => localStorage.getItem('matrix:appearance')), 'dark');
  checks.push('Appearance toggle: dark theme applied and persisted in isolated profile');
  await navigate('/');
  await waitFor(() => !document.body.textContent.includes('Загружаем рабочее пространство'));
  await checkPrimaryAccent('dark');
  await capture('home-dark');
  await navigate('/search');
  await capture('search-dark');
  await navigate('/database');
  await capture('catalogue-dark');
  await navigate('/package-search');
  await capture('batch-dark');
  await navigate('/info');
  await capture('info-dark');
  await click('button[aria-label="Включить светлую тему"]');
  // Offscreen BrowserWindow has no system frame. Measure the real framed client size
  // without loading or showing the measuring window, then emulate that exact viewport.
  const measuringWindow = new BrowserWindow({
    ...MINIMUM_WINDOW, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const [width, height] = measuringWindow.getContentSize();
  measuringWindow.destroy();
  measuredMinimumViewport = { width, height };
  progress(`minimum native window=${MINIMUM_WINDOW.width}x${MINIMUM_WINDOW.height} viewport=${width}x${height}`);
  window.setContentSize(width, height);
  await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: await evaluate(() => devicePixelRatio), mobile: false,
  });
  await navigate('/search');
  await capture('search-minimum-light');
  await navigate('/');
  await capture('home-minimum-light');
  await navigate('/database');
  await capture('catalogue-minimum-light');
  await navigate('/package-search');
  await capture('batch-minimum-light');
  await navigate('/settings');
  await capture('settings-minimum-light');
  await navigate('/info');
  await capture('info-minimum-light');

  await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
  const reducedMotion = await evaluate(() => ({
    matched: matchMedia('(prefers-reduced-motion: reduce)').matches,
    durations: [...document.querySelectorAll('*')].flatMap(element =>
      getComputedStyle(element).transitionDuration.split(',').map(value => Number.parseFloat(value))),
  }));
  assert.ok(reducedMotion.matched, 'Reduced motion media preference must be emulated');
  assert.ok(reducedMotion.durations.every(duration => duration <= 0.0001), 'Reduced motion must disable visible transitions');
  checks.push('Reduced motion: all computed transition durations <= 0.1ms');
  assert.deepEqual(rendererErrors, [], 'Renderer must not log runtime errors');
}

async function main() {
try {
  progress('waiting-ready');
  await app.whenReady();
  progress('ready');
  Menu.setApplicationMenu(null);
  registerFixtureApis();
  await mkdir(outputDirectory, { recursive: true });
  window = new BrowserWindow({
    ...VIEWPORT, useContentSize: true, show: false,
    webPreferences: {
      preload: path.join(projectDirectory, 'build', 'main', 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true,
    },
  });
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (_details, callback) => callback({ cancel: true }));
  window.webContents.on('console-message', details => {
    if (details.level === 'error') rendererErrors.push(details.message);
  });
  window.webContents.debugger.attach('1.3');
  window.webContents.setFrameRate(30);
  progress('loading-renderer');
  await window.loadFile(path.join(projectDirectory, 'build', 'renderer', 'index.html'));
  progress('renderer-loaded');
  await window.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    ...VIEWPORT, deviceScaleFactor: await evaluate(() => devicePixelRatio), mobile: false,
  });
  await runVisualChecks();
  await checkCinematicSplash();
  progress('checks-passed');
  console.log(`Visual check passed: ${checks.length} checks, ${screenshots.length} fixture screenshots in ${outputDirectory}`);
} catch (error) {
  failure = { message: error.message, stack: error.stack };
  progress(`failed: ${error.message}`);
  console.error(error);
  process.exitCode = 1;
} finally {
  await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify({
    passed: !failure, fixtureData: true, screenshots, checks, rendererErrors, error: failure,
    minimumWindow: MINIMUM_WINDOW, minimumViewport: measuredMinimumViewport,
    primaryAccents,
    sidebarLogo, splashDetails,
  }, null, 2));
  if (window && !window.isDestroyed()) {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
    window.webContents.session.webRequest.onBeforeRequest(null);
    window.webContents.removeAllListeners('console-message');
    window.destroy();
  }
  for (const channel of handledChannels) ipcMain.removeHandler(channel);
  ipcMain.removeListener(channels.search.cancel, cancelFixtureSearch);
  app.exit(process.exitCode || 0);
}
}

// Electron waits for ESM entry evaluation before ready. Do not await ready at module level.
void main();
