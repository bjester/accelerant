/**
 * Persistence class that utilizes the Cache Storage API, for persisting data.
 */
export default class Persistence {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
    this._cache = null;
    this._promises = [];
  }

  /**
   * Returns a promise that resolves once all pending writes have completed.
   * @return {Promise<void>}
   */
  async sync() {
    return this.getPromise();
  }

  /**
   * Obtains a promise that resolves once all pending writes have completed.
   * @private
   * @return {Promise<void>}
   */
  async getPromise() {
    while (this._promises.length) {
      await this._promises.pop();
    }
  }

  /**
   * Obtains the cache instance, and opens it if it hasn't been opened yet.
   * @return {Promise<Cache>}
   */
  async getCache() {
    if (!this._cache) {
      this._cache = await caches.open(this.name);
    }
    return this._cache;
  }

  /**
   * Formats the key to be used in the cache, by returning a Request object with a keyed path.
   * @param {string} key
   * @return {Request}
   */
  formatKey(key) {
    let prefix = '';
    try {
      prefix = self?.location?.origin || '';
    } catch (_) {
      prefix = '';
    }
    return new Request(`${prefix}/_/${key}`);
  }

  /**
   * Writes data to the cache asynchronously (does not wait for completion).
   * @param {string} key
   * @param {object|array} data
   */
  write(key, data) {
    this._promises.push(this.doWrite(key, data));
  }

  /**
   * Reads data from the cache.
   * @param {string} key
   * @return {Promise<any|null>}
   */
  async read(key) {
    const cache = await this.getCache();
    const response = await cache.match(this.formatKey(key));
    if (response) {
      return await response.json();
    }
    return null;
  }

  /**
   * Writes data to the cache, returning a promise that resolves once writing is complete.
   * @private
   * @param {string} key
   * @param {object|array} data
   * @return {Promise<void>}
   */
  async doWrite(key, data) {
    const cache = await this.getCache();
    const response = new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
      },
    });
    await cache.put(this.formatKey(key), response);
  }
}
