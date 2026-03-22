export default class RequestContext extends Request {
  /**
   * @param {Request} request
   * @param {Object|RequestInit} options
   */
  constructor(request, options = undefined) {
    super(request, options);
    const { pathPrefix = '' } = options || {};
    this._pathPrefix = pathPrefix;
  }

  get urlObject() {
    return new URL(this.url);
  }

  get params() {
    return this.urlObject.searchParams;
  }

  get pathname() {
    return this.urlObject.pathname;
  }

  get relativePath() {
    return this.pathname.replace(this._pathPrefix, '');
  }

  get path() {
    return this.relativePath;
  }

  get pathSplit() {
    return this.relativePath.split('/').filter(Boolean);
  }

  /**
   * Get the storage path from the URL (removes '/storage/' prefix)
   * @return {string}
   */
  getStoragePath() {
    if (this.pathSplit[0] === 'storage') {
      return this.pathSplit.slice(1).join('/');
    }
    return this.relativePath;
  }

  /**
   * @param {function(string):boolean} keyFilter
   * @return {Generator<[string, string[]]>}
   */
  *paramEntries(keyFilter = (_key) => true) {
    const seen = new Set();
    for (const rawKey of this.params.keys()) {
      if (seen.has(rawKey)) {
        continue;
      }
      seen.add(rawKey);
      const normalizedKey = rawKey.replace('[]', '');
      if (keyFilter(normalizedKey)) {
        yield [normalizedKey, this.params.getAll(rawKey)];
      }
    }
  }

  /**
   * @param {function(accumulator: mixed<T>, currentValue: mixed, key:string):mixed} reducer
   * @param {mixed<T>} [initialValue]
   * @param {function(string):boolean} [keyFilter]
   * @return {mixed<T>}
   */
  reduceParams(
    reducer = (_accumulator, currentValue, _key) => currentValue,
    initialValue = undefined,
    keyFilter = undefined,
  ) {
    for (const [key, value] of this.paramEntries(keyFilter)) {
      initialValue = reducer(initialValue, value, key);
    }
    return initialValue;
  }
}

/**
 * Flattens an object or array recursively into an array of [key, value] pairs for query params.
 * This avoids key collisions for array items by returning pairs instead of an object.
 * @param {Object|Array} thing
 * @param {String|null} [parentKey]
 * @return {Array<[string, any]>}
 */
export function flattenToParams(thing, parentKey = null) {
  const output = [];
  if (Array.isArray(thing)) {
    const newKey = `${parentKey || ''}[]`;
    for (const item of thing) {
      if (item !== null && (Array.isArray(item) || typeof item === 'object')) {
        output.push(...flattenToParams(item, newKey));
      } else {
        output.push([newKey, item]);
      }
    }
    return output;
  }

  for (const [key, value] of Object.entries(thing)) {
    const newKey = parentKey ? `${parentKey}[${key}]` : key;
    if (value !== null && (Array.isArray(value) || typeof value === 'object')) {
      output.push(...flattenToParams(value, newKey));
    } else {
      output.push([newKey, value]);
    }
  }
  return output;
}
