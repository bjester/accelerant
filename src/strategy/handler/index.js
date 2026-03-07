/**
 * Some of the code in this file is based on the workbox-strategies library:
 *
 * Copyright 2020 Google LLC
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */
import {StrategyHandler as BaseStrategyHandler} from 'workbox-strategies';
import {
  InvalidImplementationError,
  ServerError
} from "../../errors.js";
import RequestContext from "../../request/index.js";
import {
  MethodNotAllowedError,
} from "../../errors.js";

/**
 * @see https://github.com/GoogleChrome/workbox/blob/v7/packages/workbox-strategies/src/StrategyHandler.ts
 */
export default class StrategyHandler extends BaseStrategyHandler {
  /**
   * @param {WorkerRuntime} runtime
   * @param {Strategy} strategy
   * @param {HandlerCallbackOptions} options
   */
  constructor(runtime, strategy, options = {}) {
    super(strategy, options);
    this._runtime = runtime;

    // shared plugin state-- ancestor class creates a state object for each plugin, which is passed
    // to them when they're called
    this.state = {};
  }

  /**
   * @method hasCallback
   * @param {string} name The name of the callback to check for
   * @return {boolean}
   */

  /**
   * @method iterateCallbacks
   * @param {string} name The name of the callback to run
   * @return {Array<Function>}
   */

  /**
   * @method runCallbacks
   * @param {string} name The name of the callback to run within each plugin.
   * @param {Object} param The object to pass as the first (and only) param
   *     when executing each callback. This object will be merged with the
   *     current plugin state prior to callback execution.
   */

  /**
   * @return {Strategy}
   */
  get strategy() {
    return this._strategy;
  }

  /**
   * @return {WorkerRuntime}
   */
  get runtime() {
    return this._runtime;
  }

  /**
   * @return {string}
   */
  get apiPath() {
    return this.strategy?.options?.apiPath?.replace(/\/$/, '') || '';
  }

  /**
   * @return {string}
   */
  get cacheName() {
    return this.strategy.cacheName;
  }

  /**
   * @return {string[]}
   */
  get allowedMethods() {
    return [];
  }

  /**
   * @param {Request|string} input
   */
  async fetch(input) {
    const {event} = this;
    let request = (typeof input === 'string' || input instanceof String)
      ? new Request(input)
      : input;

    if (!['same-origin', 'cors'].includes(request.mode)) {
      throw new InvalidImplementationError(`Unsupported request mode '${request.mode}'`);
    }

    // If there is a fetchDidFail plugin, we need to save a clone of the
    // original request before it's either modified by a requestWillFetch
    // plugin or before the original request's body is consumed via fetch().
    const originalRequest = this.hasCallback('fetchDidFail')
      ? request.clone()
      : null;

    try {
      for (const cb of this.iterateCallbacks('requestWillFetch')) {
        request = await cb({request: request.clone(), event});
      }
    } catch (err) {
      if (err instanceof Error) {
        throw new ServerError(`Plugin error: requestWillFetch`, 500, err);
      }
    }

    // The request can be altered by plugins with `requestWillFetch` making
    // the original request (most likely from a `fetch` event) different
    // from the Request we make. Pass both to `fetchDidFail` to aid debugging.
    const pluginFilteredRequest = request.clone();

    try {
      let fetchResponse;

      // See https://github.com/GoogleChrome/workbox/issues/1796
      fetchResponse = await this._runFetch(request);

      for (const callback of this.iterateCallbacks('fetchDidSucceed')) {
        fetchResponse = await callback({
          event,
          request: pluginFilteredRequest,
          response: fetchResponse,
        });
      }
      return fetchResponse;
    } catch (error) {
      // `originalRequest` will only exist if a `fetchDidFail` callback
      // is being used (see above).
      if (originalRequest) {
        await this.runCallbacks('fetchDidFail', {
          error,
          event,
          originalRequest: originalRequest.clone(),
          request: pluginFilteredRequest.clone(),
        });
      }
      throw error;
    }
  }

  /**
   * @param {Request} request
   * @return {Response}
   */
  async _runFetch(request) {
    let response;
    try {
      this._assertMethod(request, this.allowedMethods);
      response = await this._doFetch(request);
    } catch (e) {
      const errorResponse = this.runtime.response.json.fromError(e, {
        returnDefault: false,
      });
      if (errorResponse) {
        return errorResponse;
      }
      return this._handleError(e);
    }
    return response;
  }

  /**
   * @param {Error} error
   * @return {Response}
   * @private
   */
  _handleError(error) {
    console.error(error);
    return this.runtime.response.json.internalServerError({
      error: 'unknown',
      code: error.code,
      message: error.message,
    });
  }

  _assertMethod(request, methods) {
    if (!Array.isArray(methods)) {
      methods = [methods];
    }
    if (methods.length && !methods.includes(request.method)) {
      throw new MethodNotAllowedError(`Method not allowed: ${request.method}`);
    }
  }

  /**
   * @param {string} name
   * @return {Generator<Function<Promise>>}
   */
  *iterateCallbacks(name) {
    for (const callback of super.iterateCallbacks(name)) {
      yield (params) => callback({ ...params, handler: this });
    }
  }

  /**
   * @param {Request} request
   * @return {RequestContext}
   * @protected
   */
  _getContext(request) {
    return new RequestContext(request, { pathPrefix: this.apiPath });
  }

  /**
   * @param {Request} request
   * @return {Promise<Response>}
   * @protected
   */
  async _doFetch(request) {
    throw new InvalidImplementationError('Method Not Implemented');
  }

  /**
   * @param {string} name
   * @param {AlterIndex} alter
   * @param {Request} request
   * @param {Response} response
   * @return {Promise<AlterIndex>}
   */
  async prepareAlterIndex(name, alter, request, response) {
    return alter;
  }
}
