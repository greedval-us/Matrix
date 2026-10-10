const closedSessionError = () => new Error("Клиент поиска закрыт");

export async function withTemporaryClient(createClient, operation, dispose = (client) => client.dispose()) {
  const client = createClient();
  let operationFailed = false;
  try {
    return await operation(client);
  } catch (error) {
    operationFailed = true;
    throw error;
  } finally {
    try { await dispose(client); } catch (error) { if (!operationFailed) throw error; }
  }
}

export class SearchSessionRegistry {
  constructor({ createClient, onCleanupError = () => {} }) {
    this.createClient = createClient;
    this.onCleanupError = onCleanupError;
    this.owners = new Map();
  }

  ownerRecord(owner) {
    let record = this.owners.get(owner.id);
    if (!record) {
      record = { owner, entries: new Map() };
      record.onDestroyed = () => { void this.destroyOwner(owner).catch(this.onCleanupError); };
      owner.once?.("destroyed", record.onDestroyed);
      this.owners.set(owner.id, record);
    }
    return record;
  }

  release(entry) {
    if (entry.disposal) return entry.disposal;
    entry.closed = true;
    if (entry.record.entries.get(entry.key) === entry) entry.record.entries.delete(entry.key);
    if (entry.record.entries.size === 0) {
      entry.record.owner.removeListener?.("destroyed", entry.record.onDestroyed);
      if (this.owners.get(entry.record.owner.id) === entry.record) this.owners.delete(entry.record.owner.id);
    }
    try { entry.disposal = Promise.resolve(entry.client.dispose()); }
    catch (error) { entry.disposal = Promise.reject(error); }
    return entry.disposal;
  }

  async create(tabId, owner) {
    if (owner.isDestroyed?.()) throw closedSessionError();
    const client = this.createClient();
    const previous = this.owners.get(owner.id)?.entries.get(tabId);
    const previousDisposal = previous ? this.release(previous) : Promise.resolve();
    const record = this.ownerRecord(owner);
    const entry = { key: tabId, record, client, closed: false };
    record.entries.set(tabId, entry);
    try {
      await previousDisposal;
      if (entry.closed) throw closedSessionError();
      const status = await entry.client.connect();
      if (entry.closed || owner.isDestroyed?.()) throw closedSessionError();
      entry.ready = true;
      return status;
    } catch (error) {
      const invalidated = entry.closed;
      await this.release(entry).catch(this.onCleanupError);
      throw invalidated ? closedSessionError() : error;
    }
  }

  get(tabId, owner) {
    const entry = this.owners.get(owner.id)?.entries.get(tabId);
    return entry?.ready && !entry.closed ? entry.client : undefined;
  }

  async destroy(tabId, owner) {
    const entry = this.owners.get(owner.id)?.entries.get(tabId);
    if (entry) await this.release(entry);
  }

  async destroyOwner(owner) {
    const entries = [...(this.owners.get(owner.id)?.entries.values() || [])];
    await Promise.all(entries.map((entry) => this.release(entry)));
  }

  async reset() {
    const entries = [...this.owners.values()].flatMap((record) => [...record.entries.values()]);
    await Promise.all(entries.map((entry) => this.release(entry)));
  }

  async withTemporary(owner, operation, configOverride) {
    if (owner.isDestroyed?.()) throw closedSessionError();
    const key = Symbol("temporary client");
    const client = this.createClient(configOverride);
    const record = this.ownerRecord(owner);
    const entry = { key, record, client, closed: false };
    record.entries.set(key, entry);
    return await withTemporaryClient(() => client, async (service) => {
      const result = await operation(service);
      if (entry.closed || owner.isDestroyed?.()) throw closedSessionError();
      return result;
    }, () => this.release(entry));
  }
}
