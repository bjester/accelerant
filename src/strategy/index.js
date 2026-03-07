import {
  Strategy as BaseStrategy,
  CacheFirst as BaseCacheFirst,
  CacheOnly as BaseCacheOnly,
  NetworkFirst as BaseNetworkFirst,
  NetworkOnly as BaseNetworkOnly,
  StaleWhileRevalidate as BaseStaleWhileRevalidate,
} from 'workbox-strategies';
import {
  WorkboxError,
  InvalidImplementationError,
  MethodNotAllowedError
} from '../errors.js';
import StrategyHandlerFactory from "./handler/factory.js";
import {StrategyHandler} from "workbox-strategies/src/StrategyHandler.ts";
import {CacheInvalidateWorkboxPlugin} from "./plugins/core.js";

/**
 * @typedef StrategyOptions
 * @property {WorkerRuntime} runtime
 * @property {StrategyHandlerFactory} [handlerFactory]
 * @property {string} [cacheName]
 * @property {Array<Object>} [plugins]
 * @property {Object} [fetchOptions]
 * @property {Object} [matchOptions]
 */

/**
 * @param {Object<T>} options
 * @param {WorkerRuntime} runtime
 * @param {StrategyHandlerFactory} [handlerFactory]
 * @param {string} [cacheName]
 * @param {Array<Object>} [plugins]
 * @param {Object} [fetchOptions]
 * @param {Object} [matchOptions]
 * @return {{superOptions: Object<T>, otherOptions: Object<T>, [StrategyOptions]}}
 */
function splitOptions(
  {
    runtime,
    handlerFactory = null,
    cacheName = undefined,
    plugins = [],
    fetchOptions = {},
    matchOptions = {},
    ...otherOptions
  } = {}
) {
  const superOptions = {cacheName, plugins, fetchOptions, matchOptions};
  return {
    runtime,
    handlerFactory: handlerFactory || new StrategyHandlerFactory(runtime),
    superOptions,
    otherOptions,
  };
}

export class Strategy extends BaseStrategy {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {Request|string} request
   * @param {StrategyHandler} handler
   * @return {Promise<Response>}
   * @private
   */
  async _handle(request, handler) {
    return handler.fetch(request);
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}

export class CacheFirst extends BaseCacheFirst {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}

export class CacheAfter extends Strategy {
  /**
   * @private
   * @param {Request} request
   * @param {StrategyHandler} handler
   * @return {Promise<Response>}
   */
  async _handle(request, handler) {
    let response, error;

    try {
      response = await handler.fetchAndCachePut(request);
    } catch (err) {
      if (err instanceof Error) {
        error = err;
      }
    }

    if (!response) {
      throw new WorkboxError('no-response', {url: request.url, error});
    }
    return response;
  }
}

export class CacheInvalidate extends Strategy {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    super(options);
    const cacheInvalidationPlugin = this.plugins
      .find(p => p instanceof CacheInvalidateWorkboxPlugin);

    // add the invalidation plugin if not already present
    if (!cacheInvalidationPlugin) {
      this.plugins.push(new CacheInvalidateWorkboxPlugin(this.runtime, this.options));
    }
  }
}

export class CacheOnly extends BaseCacheOnly {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}

export class NetworkFirst extends BaseNetworkFirst {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}

export class NetworkOnly extends BaseNetworkOnly {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}

export class StaleWhileRevalidate extends BaseStaleWhileRevalidate {
  /**
   * @param {Object|StrategyOptions} options
   */
  constructor(options) {
    const { runtime, handlerFactory, superOptions, otherOptions} = splitOptions(options);
    super(superOptions);
    this.runtime = runtime;
    this.handlerFactory = handlerFactory;
    this.options = otherOptions;
  }

  /**
   * @param {StrategyHandler} handler
   * @param {Request} request
   * @param {ExtendableEvent} event
   * @return {Promise<Response>}
   * @private
   */
  _getResponse(handler, request, event) {
    return super._getResponse(this.handlerFactory.build(this, handler), request, event);
  }
}
