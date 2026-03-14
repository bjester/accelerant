export function patchSelf() {
  if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
  }
}

export function patchLocation() {
  if (typeof globalThis.location === 'undefined') {
    globalThis.location = new URL('http://localhost/');
  }
}

export function patchCaches() {
  if (typeof globalThis.caches !== 'undefined') return;

  const stores = new Map();
  globalThis.caches = {
    async open(name) {
      if (!stores.has(name)) {
        const map = new Map();
        stores.set(name, {
          async match(request) {
            const key = request.url || String(request);
            return map.get(key);
          },
          async put(request, response) {
            const key = request.url || String(request);
            map.set(key, response);
          },
          async delete(request) {
            const key = request.url || String(request);
            return map.delete(key);
          }
        });
      }
      return stores.get(name);
    }
  };
}

export default function patchAll() {
  patchSelf();
  patchLocation();
  patchCaches();
}