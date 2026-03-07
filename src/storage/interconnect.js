import {InMemoryStorage} from "./shim.js";

export async function storageWithPersistence(persistence, name) {
  const data = await persistence.read(name);
  const store = new InMemoryStorage(name, data || {});
  store.on('change', () => {
    persistence.write(name, Object.fromEntries(store._store));
  });
  return store;
}
