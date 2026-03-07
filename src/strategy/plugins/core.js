import WorkboxPlugin from "./index.js";
import LookupIndex, {AlterIndex} from "../../storage/lookup.js";



/**
 * Return a simple request, so the cache is keyed by URL
 *
 * @param {Request|null} [request]
 * @param {string|null} [url]
 * @return {Request}
 */
export function getCacheKey({ request = null, url = null }) {
  if (request && !url) {
    url = request.url;
  }
  if (url) {
    if (!url.startsWith(self.location.origin)) {
      url = self.location.origin + (url.startsWith('/') ? url : `/${url}`);
    }
    return new Request(url);
  }
  throw new Error('No request or url provided');
}

export class TimingWorkboxPlugin extends WorkboxPlugin {
  _finalize(response, state) {
    const headers = {};

    if (state.handlerStart) {
      headers['X-Worker-Time'] = `${(performance.now() - state.handlerStart).toFixed(2)}ms`;
    }

    if (state.requestStart && state.requestStop) {
      headers['X-Upstream-Time'] = `${(state.requestStop - state.requestStart).toFixed(2)}ms`;
    }

    if (Object.keys(headers).length > 0) {
      return this._addHeaders(response, headers);
    }
    return response;
  }

  async handlerWillStart({ state }) {
    state.handlerStart = performance.now();
  }

  async requestWillFetch({ state, request }) {
    state.requestStart = performance.now();
    return request;
  }

  async fetchDidSucceed({ response, state }) {
    state.requestStop = performance.now();
    return response;
  }

  async fetchDidFail({ state }) {
    state.requestStop = performance.now();
  }

  async handlerWillRespond({ state, response }) {
    return this._finalize(response, state);
  }
}

export class IndexingWorkboxPlugin extends WorkboxPlugin {
  get indexName() {
    return this.options?.name || 'index';
  }

  get fieldName() {
    return this.options?.fieldName || 'id';
  }

  /**
   * @return {function(Request, object, StrategyHandler): string[]}
   */
  get keysFunc() {
    return this.options?.keysFunc || ((request, responseData) => {
      return [responseData[this.fieldName]];
    });
  }

  async getIndex(handler) {
    // store primary copy of index in the handler state, so this plugin can be inherited, and
    // descendants or users of the plugin can access it
    let index = handler.state.index[this.indexName];
    if (!index) {
      index = handler.state.index[this.indexName] = await LookupIndex.getInstance(
        `${this.indexName}-${this.runtime.version}`
      );
    }
    return index;
  }

  /**
   * @param {object} state
   * @param {StrategyHandler} handler
   * @return {Promise<void>}
   */
  async handlerWillStart({ state, handler }) {
    if (!handler.state.index) {
      handler.state.index = {};
    }

    state.index = await this.getIndex(handler);
    state.alter = new AlterIndex();
    state.indexUpdated = false;
  }

  /**
   * @param {AlterIndex} alter
   * @param {Request} request
   * @param {Response} response
   * @param {StrategyHandler} handler
   * @return {Promise<AlterIndex>}
   */
  async _prepareAlter(alter, request, response, handler) {
    const contentType = response.headers.get('Content-Type');
    if (!/^application\/(?:[\w.]+\+)?json$/.test(contentType)) {
      return alter;
    }

    let data = {};

    try {
      data = await response.clone().json();
    } catch (e) {
      console.error(e);
      return alter;
    }

    const sourceDatums = Array.isArray(data) ? data : [data];
    for (const sourceDatum of sourceDatums) {
      if (!sourceDatum) continue;

      for (const key of this.keysFunc(request, sourceDatum, handler)) {
        alter.add(key);
      }
    }

    return alter;
  }

  /**
   * @param {object} state
   * @param {Request} request
   * @param {Response} response
   * @param {StrategyHandler} handler
   */
  async _updateIndex(state, request, response, handler) {
    if (!state.alter) {
      return;
    }
    state.alter = await handler.prepareAlterIndex(this.indexName, state.alter, request, response);
    state.alter = await this._prepareAlter(state.alter, request, response, handler);
    await state.alter.apply(state.index, request.url);
    await state.index.sync();
  }

  /**
   * @param {object} state
   * @param {Request} request
   * @param {Response} response
   * @param {StrategyHandler} handler
   * @return {Promise<Response>}
   */
  async fetchDidSucceed({ state, request, response, handler }) {
    if (!response || !response.ok || response.status === 204 || !handler || state.indexUpdated) {
      return response;
    }

    state.indexUpdated = true;

    // do not await-- background update
    handler.waitUntil(this._updateIndex(state, request, response.clone(), handler));

    return response;
  }
}

export class CacheWorkboxPlugin extends WorkboxPlugin {
  /**
   * @param {object} options
   * @return {Promise<void>}
   */
  async handlerWillStart({ state }) {
    state.cachedResponseWillBeUsed = false;
  }

  async fetchDidSucceed({ handler, request, response }) {
    if (!response || !response.ok || response.status === 204) {
      return response;
    }
    this.events.emit('create', request.url);
    return this._addHeaders(response, {
      'X-Worker-Cache-Status': 'MISS',
      'X-Worker-Cache-Time': (new Date()).toISOString(),
      'X-Worker-Cache-Zone': handler.cacheName,
    });
  }

  async cachedResponseWillBeUsed({ state, cachedResponse }) {
    if (!cachedResponse) {
      return cachedResponse;
    }
    state.cachedResponseWillBeUsed = true;
    return this._newResponse(cachedResponse, {
      status: 200,
      statusText: 'OK',
    }, {
      'X-Worker-Cache-Status': 'HIT',
    });
  }

  async cacheKeyWillBeUsed({request}) {
    return getCacheKey({ request });
  }

  async cacheWillUpdate({request, response, handler}) {
    if (!response || !response.ok || response.status === 204) {
      return null;
    }

    this.events.emit('update', request.url);

    return this._addHeaders(response, {
      'X-Worker-Cache-Status': 'UPDATING',
      'X-Worker-Cache-Zone': handler.cacheName,
      'X-Worker-Cache-Time': (new Date()).toISOString(),
    });
  }
}

export class CacheInvalidateWorkboxPlugin extends WorkboxPlugin {
  /**
   * @return {function(Request, StrategyHandler): Promise<Array<Request>>}
   */
  get cacheKeyFunc() {
    return this.options?.cacheKeyFunc || (async request => [request]);
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   */
  async _runInvalidate(handler, request) {
    const cache = await caches.open(handler.cacheName);
    for (const cacheKey of await this.cacheKeyFunc(request, handler)) {
      // always still pass the request to handler.getCacheKey
      const _cacheKey = await handler.getCacheKey(cacheKey, 'write');
      this.events.emit('invalidate', _cacheKey.url);
      await cache.delete(_cacheKey);
    }
  }

  /**
   * @param {Object} options
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {StrategyHandler} options.handler
   * @return {Promise<Response>}
   */
  async fetchDidSucceed({request, response, handler}) {
    if (!response || (!response.ok && !this.options?.always)) {
      return response;
    }

    // do not await-- background update
    handler.waitUntil(this._runInvalidate(handler, request));

    return response;
  }

  /**
   * @param {Object} options
   * @param {Request} options.request
   * @param {StrategyHandler} options.handler
   * @return {Promise<void>}
   */
  async fetchDidFail({request, handler}) {
    if (!this.options?.always) {
      return;
    }

    // do not await-- background update
    handler.waitUntil(this._runInvalidate(handler, request));
  }
}

const DEFAULT_ANNOUNCE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const DEFAULT_ANNOUNCE_STATUSES = [200, 201, 204];

export class AnnouncementWorkboxPlugin extends WorkboxPlugin {
  get eventNamespace() {
    return this.options.eventNamespace || 'firebase';
  }

  get broadcastChannel() {
    return this.options.broadcastChannel || this.runtime.broadcastChannel;
  }

  get methodsToAnnounce() {
    return this.options.methodsToAnnounce || DEFAULT_ANNOUNCE_METHODS;
  }

  get statusesToAnnounce() {
    return this.options.statusesToAnnounce || DEFAULT_ANNOUNCE_STATUSES;
  }

  _postMessage(request, response) {
    if (response && this.statusesToAnnounce.includes(response.status) && this.methodsToAnnounce.includes(request.method)) {
      this.broadcastChannel.postMessage({
        type: `${this.eventNamespace}:${request.method.toLowerCase()}`,
        url: (new URL(request.url)).pathname,
        updatedAt: Date.now(),
      });
    }
  }

  /**
   * @param {Request} request
   * @param {Response} response
   * @return {Promise<Response>}
   */
  async fetchDidSucceed({ request, response }) {
    this._postMessage(request, response);
    return response;
  }

  /**
   * @param {Request} request
   * @param {Error} error
   * @return {Promise<void>}
   */
  async fetchDidFail({ request, error }) {
    this._postMessage(request, new Response(error.message, {status: 500}));
  }
}