import EventEmitter from '../events.js';
import { storageWithPersistence } from './interconnect.js';

const _global = typeof self !== 'undefined' ? self : globalThis;

class StorageEvent extends Event {
  constructor(storageArea, key, oldValue, newValue) {
    super('storage');
    this.storageArea = storageArea;
    this.key = key;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.url = _global.location?.href || '';
  }
}

/**
 * An in-memory storage implementation that mimics the behavior of localStorage, for use
 * in service worker environments.
 */
export class InMemoryStorage extends EventEmitter {
  constructor(type, data = {}) {
    super();
    this.type = type;
    this._store = new Map(Object.entries(data));
  }

  newEvent(key, oldValue, newValue) {
    return new StorageEvent(this, key, oldValue, newValue);
  }

  getItem(key) {
    const stringKey = String(key);
    if (this._store.has(stringKey)) {
      return this._store.get(stringKey);
    }
    return null;
  }

  setItem(key, val) {
    const oldValue = this.getItem(key);
    key = String(key);
    const event = this.newEvent(key, oldValue, val);
    this._store.set(key, val);
    this.emit('change', event);
  }

  removeItem(key) {
    const stringKey = String(key);
    const oldValue = this.getItem(stringKey);
    if (this._store.has(stringKey)) {
      this._store.delete(stringKey);
      const event = this.newEvent(stringKey, oldValue, null);
      this.emit('change', event);
    }
  }

  clear() {
    const events = [];
    for (const [key, value] of this._store.entries()) {
      events.push(this.newEvent(key, value, null));
    }
    this._store.clear();
    for (const event of events) {
      this.emit('change', event);
    }
  }

  key(i) {
    if (i === undefined) {
      // this is a TypeError implemented on Chrome, Firefox throws Not enough arguments to Storage.key.
      throw new TypeError(
        "Failed to execute 'key' on 'Storage': 1 argument required, but only 0 present.",
      );
    }
    const keys = Array.from(this._store.keys());
    return keys[i];
  }

  get length() {
    return this._store.size;
  }
}

/**
 * A simple shim to provide a localStorage and sessionStorage-like interface
 * to an in-memory store, for service worker environments.
 *
 * @param {Persistence} persistence
 * @return {{localStorage: InMemoryStorage, sessionStorage: InMemoryStorage}}
 */
export default async function init(persistence) {
  const stores = {
    localStorage: 'local',
    sessionStorage: 'session',
  };

  if (!_global.window) {
    _global.window = _global;
  }

  // Proxy all Storage methods to the corresponding store
  for (const [globalName, name] of Object.entries(stores)) {
    const store = await storageWithPersistence(persistence, name);
    stores[globalName] = store;

    _global[globalName] = new Proxy(store, {
      set(_obj, prop, value) {
        if (Object.hasOwn(InMemoryStorage.prototype, prop)) {
          store[prop] = value;
        } else {
          store.setItem(prop, value);
        }
        return true;
      },
      get(_target, name) {
        if (Object.hasOwn(InMemoryStorage.prototype, name)) {
          return store[name];
        }
        if (store._store.has(name)) {
          return store.getItem(name);
        }
      },
    });
  }

  // Allow adding listeners to Storage events via `onstorage`
  Object.defineProperty(_global, 'onstorage', {
    get() {
      return null;
    },
    set(handler) {
      stores.localStorage.on('change', handler);
    },
  });

  return stores;
}
