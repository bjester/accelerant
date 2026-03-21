import EventEmitter from '../../events.js';

/**
 *
 * @param {Response} response
 * @param {ReadableStream|Blob|string|null} body
 * @param {Number} [status]
 * @param {string|null} [statusText]
 * @param {HeadersInit|object} [headers]
 * @return {Response}
 */
export function newResponse(response, body, { status = null, statusText = null }, headers = {}) {
  if (!body) {
    body = response.body;
  }
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(headers)) {
    newHeaders.set(key, value);
  }

  status = status || response.status;
  statusText = statusText || response.statusText;

  return new Response(body, {
    status,
    statusText,
    headers: newHeaders,
  });
}

export default class WorkboxPlugin {
  /**
   * @param {WorkerRuntime} runtime
   * @param {object} [options]
   */
  constructor(runtime, options = {}) {
    this._runtime = runtime;
    this._events = null;
    this.options = options;
  }

  /**
   * @return {WorkerRuntime}
   */
  get runtime() {
    return this._runtime;
  }

  /**
   * @return {EventEmitter}
   */
  get events() {
    // lazy load in case it's unused
    if (!this._events) {
      this._events = new EventEmitter();
    }
    return this._events;
  }

  /**
   * @param {Response} response
   * @param {Object} status
   * @param {Number} status.status
   * @param {String} status.statusText
   * @param {Object} headers
   * @return {Response}
   * @protected
   */
  _newResponse(response, status, headers) {
    return newResponse(response, response.body, status, headers);
  }

  /**
   * @param {Response} response
   * @param {Object} headers
   * @return {Response}
   */
  _addHeaders(response, headers) {
    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
    return response;
  }

  /**
   * Called when a new entry is added to a cache or if an existing entry is updated. Plugins that
   * use this method may be useful when you want to perform an action after a cache update.
   *
   * @method cacheDidUpdate
   * @param {Object} options
   * @param {string} options.cacheName
   * @param {ExtendableEvent} options.event
   * @param {Response} options.newResponse
   * @param {Response} options.oldResponse
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<void>}
   */

  /**
   * Called before a request is used as a cache key. This occurs for both cache lookups (when `mode`
   * is `'read'`) and cache writes (when `mode is `'write'`). This callback is handy if you need to
   * override or normalize URLs prior to using them to access caches.
   *
   * @method cacheKeyWillBeUsed
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {string} options.mode
   * @param {Object} options.params
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<string|Request>}
   */

  /**
   * This is called just before a response from a cache is used, which allows you to examine that
   * response. At this point in time, you could either return a different response or return `null`.
   *
   * @method cachedResponseWillBeUsed
   * @param {Object} options
   * @param {string} options.cacheName
   * @param {Response} options.cachedResponse
   * @param {ExtendableEvent} options.event
   * @param {CacheQueryOptions} options.matchOptions
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<void|Response>}
   */

  /**
   * Called before a `Response` is used to update a cache. In this method, the response can be
   * changed before it's added to the cache, or you can return `null` to avoid updating the cache
   * entirely.
   *
   * @method cacheWillUpdate
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {Map} options.state
   * @return {Promise<void|Response>}
   */

  /**
   * Called whenever a request is about to go to the network. Useful when you need to change the
   * `Request` just before it goes to the network.
   *
   * @method requestWillFetch
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<Request>}
   */

  /**
   * Called when a network request fails, most likely due to an absence of network connectivity,
   * and will not fire when the browser has a network connection, but receives an error (for
   * example, `404 Not Found`).
   *
   * @method fetchDidFail
   * @param {Object} options
   * @param {Error} options.error
   * @param {ExtendableEvent} options.event
   * @param {Request} options.originalRequest
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<void>}
   */

  /**
   * Called whenever a network request succeeds, regardless of the HTTP response code.
   *
   * @method fetchDidSucceed
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {Map} options.state
   * @return {Promise<Response>}
   */

  /**
   * Called before any handler logic starts running, which is useful if you need to set the initial
   * handler state. For example, if you wanted to know how long the handler took to generate a
   * response, you could make a note of the start time in this callback.
   *
   * @method handlerWillStart
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<void>}
   */

  /**
   * Called before the strategy's `handle()` method returns a response, which is helpful if you need
   * to modify a response before returning it to a `RouteHandler` or other custom logic.
   *
   * @method handlerWillRespond
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {Map} options.state
   * @return {Promise<Response>}
   */

  /**
   * Called after the strategy's `handle()` method returns a response. This is when it might be
   * useful to record any final response details (for example, after changes made by other plugins).
   *
   * @method handlerDidRespond
   * @param {Object} options
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {Map} options.state
   * @return {Promise<void>}
   */

  /**
   * Called after all extend lifetime promises added to the event from the invocation of the
   * strategy have settled. This is helpful if you need to report on any data that needs to wait
   * until the handler is done in order to calculate stuff like cache hit status, cache latency,
   * network latency, and other useful information.
   *
   * @method handlerDidComplete
   * @param {Object} options
   * @param {Error} options.error
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Response} options.response
   * @param {Map} options.state
   * @return {Promise<void>}
   */

  /**
   * Called if the handler can't provide a valid response from any source, which is the optimal time
   * to provide some sort of fallback response as an alternative to failing outright.
   *
   * @method handlerDidError
   * @param {Object} options
   * @param {Error} options.error
   * @param {ExtendableEvent} options.event
   * @param {Request} options.request
   * @param {Map} options.state
   * @return {Promise<Response>}
   */
}
