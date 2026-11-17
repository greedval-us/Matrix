import { readFile, mkdtemp, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { ResultParser } from '../../renderer/utils/ResultParser.js';
import { nonEmptyResultFields } from '../../shared/utils/resultFields.js';

const workerSource = new URL('./searchResultSpoolWorker.js', import.meta.url);
let workerUrl;
const csvValue = value => `"${String(value).replaceAll('"', '""')}"`;

export class SearchResultSpool {
  static async create() {
    // Loading a self-contained worker by URL also works when this app lives in ASAR.
    workerUrl ??= new URL(`data:text/javascript;base64,${(await readFile(workerSource)).toString('base64')}`);
    const directory = await mkdtemp(path.join(tmpdir(), 'matrix-search-'));
    const spool = new SearchResultSpool(directory);
    try {
      spool.worker = new Worker(workerUrl, { workerData: spool.filename });
      spool.worker.on('message', ({ id, result, error }) => {
        const request = spool.requests.get(id);
        spool.requests.delete(id);
        if (error) request?.reject(new Error(error));
        else request?.resolve(result);
      });
      spool.worker.once('error', error => spool.fail(error));
      spool.worker.once('exit', () => spool.fail(new Error('Хранилище результатов закрыто')));
      await spool.summary();
      return spool;
    } catch (error) {
      await spool.close().catch(() => {});
      throw error;
    }
  }

  constructor(directory) {
    this.directory = directory;
    this.filename = path.join(directory, 'results.sqlite');
    this.requests = new Map();
    this.nextId = 0;
    this.parser = new ResultParser();
  }

  fail(error) {
    this.failure ??= error;
    for (const request of this.requests.values()) request.reject(this.failure);
    this.requests.clear();
  }

  request(method, args = []) {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.requests.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, method, args }); }
      catch (error) { this.requests.delete(id); reject(error); }
    });
  }

  append(items) {
    const entries = items.map(raw => this.parser.parse(raw));
    return this.request('append', [entries]);
  }

  summary() { return this.request('summary'); }

  async read(source, start, limit) {
    if (typeof source !== 'string' || !Number.isSafeInteger(start) || start < 0 ||
        !Number.isSafeInteger(limit) || limit < 1 || limit > 256) {
      throw new Error('Недопустимый диапазон результатов');
    }
    return this.request('read', [source, start, limit]);
  }

  async *export(format) {
    const { sources, fieldLabels } = await this.summary();
    if (format === 'csv') yield '\uFEFF';
    for (const source of sources) {
      const columns = format === 'csv' ? await this.request('columns', [source.source]) : [];
      if (format === 'csv') {
        yield `${csvValue(`Источник: ${source.name}`)}\r\n`;
        if (source.info) yield `${csvValue(source.info)}\r\n`;
        if (columns.length) yield `${columns.map(key => csvValue(fieldLabels[key] || key)).join(',')}\r\n`;
      } else yield `Источник: ${source.name}\n${source.info || ''}\n\n`;
      for (let start = 0; start < source.recordCount; start += 128) {
        const rows = await this.read(source.source, start, 128);
        let output = '';
        for (const row of rows) {
          const fields = nonEmptyResultFields(row);
          if (!fields.length) continue;
          if (format === 'csv') {
            const values = new Map(fields);
            output += columns.map(key => csvValue(values.get(key) ?? '')).join(',') + '\r\n';
          } else {
            for (const [key, value] of fields) output += `${fieldLabels[key] || key} = ${value}\n`;
            output += '\n';
          }
        }
        if (output) yield output;
      }
      yield format === 'csv' ? '\r\n' : '\n';
    }
  }

  close() {
    this.closing ??= this.dispose();
    return this.closing;
  }

  async dispose() {
    this.fail(new Error('Хранилище результатов закрыто'));
    await this.worker?.terminate();
    await unlink(this.filename).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await rmdir(this.directory);
  }
}
