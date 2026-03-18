import { InMemoryStorage } from "./shim.js";
import Persistence from "./persistence.js";

/**
 * @type {Map<string, PrefixIndex>}
 */
const instances = new Map();

/**
 * Base Index interface
 * @class
 */
class IndexInterface {
  /**
   * @return {Promise<void>}
   */
  async sync() {}

  /**
   * @param {string} key
   * @return {Promise<Set<string>>}
   */
  async get(key) {
    return new Set();
  }

  /**
   * @param {string} key
   * @param {function(values: Set<string>): Array<string>|Set<string>|null|Promise<Array<string>|Set<string>|null>} callback
   */
  async update(key, callback) {}
}

/**
 * Index implementation that uses a storage object to persist data
 * @class
 */
export class Index extends IndexInterface {
  /**
   * @param {string} name
   * @param {Storage|InMemoryStorage} storage
   */
  constructor(name, storage) {
    super();
    this.name = name;
    this.storage = storage;
  }

  /**
   * @param {string} key
   * @return {Promise<Set<string>>}
   */
  async get(key) {
    const value = this.storage.getItem(key);
    if (!value) {
      return new Set();
    }
    if (Array.isArray(value)) {
      return new Set(value);
    }
    if (typeof value === 'string') {
      return new Set(value.split(',').filter(Boolean));
    }
    return new Set();
  }

  /**
   * @param {string} key
   * @param {function(values: Set<string>): Array<string>|Set<string>|null|Promise<Array<string>|Set<string>|null>} callback
   */
  async update(key, callback) {
    let newValue = callback(await this.get(key));
    if (newValue instanceof Promise) {
      newValue = await newValue;
    }
    if (!newValue || newValue.size === 0) {
      this.storage.removeItem(key);
    } else {
      this.storage.setItem(key, [...newValue]);
    }
  }
}

/**
 * An Index implementation that splits indices using a prefix of the key, and delegates to
 * individual Index instances
 * @class
 */
export default class PrefixIndex extends IndexInterface {
  /**
   * @param {string} name
   * @param {number} prefixLength
   */
  constructor(name, prefixLength = 1) {
    super();
    this.name = name;
    this.prefixLength = prefixLength;
    this.persistence = new Persistence(name);
    this.indices = new Map();
    this.needsSync = new Set();
  }

  /**
   * @param {string} key
   * @return {Index}
   * @private
   */
  async _getIndex(key) {
    const prefix = this.prefixLength > 0 ? key.slice(0, this.prefixLength) : key;
    if (!this.indices.has(prefix)) {
      const data = await this.persistence.read(prefix);
      const storage = new InMemoryStorage(`${this.name}.${prefix}`, data || {});

      storage.on('change', () => {
        this.needsSync.add(prefix);
      });

      this.indices.set(prefix, new Index(`${this.name}.${prefix}`, storage));
    }
    return this.indices.get(prefix);
  }

  /**
   * @return {Promise<void>}
   */
  async sync() {
    for (const [prefix, index] of this.indices.entries()) {
      if (this.needsSync.has(prefix)) {
        this.persistence.write(prefix, Object.fromEntries(index.storage._store));
      }
    }
    this.needsSync.clear();
    await this.persistence.sync();
  }

  /**
   * @param {string} key
   * @return {Promise<Set<string>>}
   */
  async get(key) {
    const index = await this._getIndex(key);
    return index.get(key);
  }

  /**
   * @param {string} key
   * @param {function(values: Set<string>): Array<string>|Set<string>|null|Promise<Array<string>|Set<string>|null>} callback
   */
  async update(key, callback) {
    const index = await this._getIndex(key);
    return index.update(key, callback);
  }

  /**
   * @param {string} name
   * @param {number} prefixLength
   * @return {PrefixIndex}
   */
  static async getInstance(name, prefixLength = 1) {
    if (!instances.has(name)) {
      const index = new PrefixIndex(name, prefixLength);
      instances.set(name, index);
    }
    return instances.get(name);
  }
}

/**
 * A class to represent a modification to an index, queuing up additions and removals from the index
 * @class
 */
export class AlterIndex {
  constructor() {
    this._add = new Set();
    this._remove = new Set();
  }

  /**
   * @param {string} key
   * @return {AlterIndex}
   */
  add(key) {
    this._add.add(key);
    return this;
  }

  /**
   * @param {string} key
   * @return {AlterIndex}
   */
  remove(key) {
    this._remove.add(key);
    return this;
  }

  /**
   * @param {Index} index
   * @param {string} value
   */
  async apply(index, value) {
    for (const key of this._add) {
      await index.update(key, async (values) => {
        values.add(value);
        return values;
      });
    }

    for (const key of this._remove) {
      await index.update(key, async () => null);
    }

    await index.sync();
  }
}