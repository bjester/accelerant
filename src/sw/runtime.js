import { registerRoute } from 'workbox-routing';

import { initializeFirebase } from '../firebase/bootstrap.js';
import ResponseFactory from '../response/index.js';
import JSONResponseFactory from '../response/json.js';
import StrategyHandlerFactory from '../strategy/handler/factory.js';
import {TimingWorkboxPlugin} from '../strategy/plugins/core.js';
import FirebaseWorkboxPlugin from '../strategy/plugins/firebase.js';
import {getChannel} from './broadcast.js';

const DEFAULT_API_PREFIX = '/api';

/**
 * @typedef AccelerantConfig
 * @property {string} version - Worker version
 * @property {Object} firebaseConfig - Firebase configuration
 * @property {boolean} useEmulators - Whether to use Firebase emulators
 * @property {string} emulatorHost - Emulator host
 * @property {number} authPort - Auth emulator port
 * @property {number} firestorePort - Firestore emulator port
 * @property {number} storagePort - Storage emulator port
 * @property {string} [apiPrefix='/api'] - API prefix for routes
 * @property {Object} [requireClaims] - Required auth claims for sign-in
 */

export default class WorkerRuntime {
  /**
   * @param {AccelerantConfig} config
   */
  constructor(config) {
    this.config = config;
    this.response = {
      plain: new ResponseFactory(),
      json: new JSONResponseFactory(),
    };
    this.firebase = null;
    this.broadcastChannel = getChannel();
  }

  get apiPrefix() {
    return this.config.apiPrefix || DEFAULT_API_PREFIX;
  }

  get version() {
    return this.config.version ?? 'v1';
  }

  getApiPath(apiPath) {
    return `${this.apiPrefix}/${apiPath}`;
  }

  urlMatcher(apiPath) {
    apiPath = this.getApiPath(apiPath);
    return ({ url, sameOrigin }) => {
      return sameOrigin && url.pathname.startsWith(apiPath);
    };
  }

  async ready() {
    if (this.firebase) {
      await this.firebase.ready;
      return;
    }
    this.firebase = initializeFirebase({
      firebaseConfig: this.config.firebaseConfig,
      useEmulators: this.config.useEmulators,
      emulatorHost: this.config.emulatorHost,
      authPort: this.config.authPort,
      firestorePort: this.config.firestorePort,
      storagePort: this.config.storagePort
    });
    await this.firebase.ready;
  }

  /**
   * Create a Workbox strategy with Accelerant handler
   * @param {typeof StrategyHandler} HandlerClass
   * @returns {StrategyOptions}
   */
  getHandlerOptions(HandlerClass = null) {
    return {
      cacheName: `${HandlerClass?.cacheName ?? 'worker'}-${this.version}`,
      runtime: this,
      handlerFactory: new StrategyHandlerFactory(this, HandlerClass),
    };
  }

  /**
   * Register a route with Accelerant
   * @param {string} method - HTTP method
   * @param {string} apiPath - API path
   * @param {typeof Strategy} StrategyClass - Workbox strategy class
   * @param {typeof StrategyHandler} HandlerClass - Accelerant handler class
   * @param {object} [options] - Strategy options
   */
  registerRoute(method, apiPath, StrategyClass, HandlerClass, options = {}) {
    const { plugins = [], ...strategyOptions } = options;
    registerRoute(
      this.urlMatcher(apiPath),
      new StrategyClass({
        ...this.getHandlerOptions(HandlerClass),
        apiPath: this.getApiPath(apiPath),
        plugins: [
          new FirebaseWorkboxPlugin(this),
          ...plugins,
          new TimingWorkboxPlugin(this),
        ],
        ...strategyOptions,
      }),
      method
    );
  }

  routeGet(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('GET', apiPath, StrategyClass, HandlerClass, options);
  }

  routeHead(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('HEAD', apiPath, StrategyClass, HandlerClass, options);
  }

  routePost(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('POST', apiPath, StrategyClass, HandlerClass, options);
  }

  routePut(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('PUT', apiPath, StrategyClass, HandlerClass, options);
  }

  routePatch(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('PATCH', apiPath, StrategyClass, HandlerClass, options);
  }

  routeDelete(apiPath, StrategyClass, HandlerClass, options = {}) {
    this.registerRoute('DELETE', apiPath, StrategyClass, HandlerClass, options);
  }
}