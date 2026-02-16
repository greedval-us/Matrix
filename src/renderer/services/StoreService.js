export class StoreService {
  constructor(storeAPI) {
    this.storeAPI = storeAPI
    this.cache = {}
  }

  async get(key) {
    const value = await this.storeAPI.get(key)
    this.cache[key] = value
    return value
  }

  async set(key, value) {
    await this.storeAPI.set(key, value)
    this.cache[key] = value
  }

  async delete(key) {
    await this.storeAPI.delete(key)
    delete this.cache[key]
  }

  async has(key) {
    return await this.storeAPI.has(key)
  }

  async clear() {
    await this.storeAPI.clear()
    this.cache = {}
  }
}