import { InMemoryStorage } from './shim.js';

const _global = typeof self !== 'undefined' ? self : globalThis;

export async function storageWithPersistence(persistence, name) {
  const data = await persistence.read(name);
  const store = new InMemoryStorage(name, data || {});
  store.on('change', () => {
    persistence.write(name, Object.fromEntries(store._store));
  });
  return store;
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
