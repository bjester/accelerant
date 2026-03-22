/**
 * Main library entry point
 * Provides service worker registration
 */
import Deferred from 'promise-be-deferred';
import { flattenToParams } from './request/index.js';

/**
 * Configuration options for Accelerant
 * @typedef {Object} AccelerantConfig
 * @property {Object} firebaseConfig - Firebase configuration object
 * @property {string} [firebaseConfig.apiKey]
 * @property {string} [firebaseConfig.authDomain]
 * @property {string} [firebaseConfig.projectId]
 * @property {string} [firebaseConfig.storageBucket]
 * @property {string} [firebaseConfig.messagingSenderId]
 * @property {string} [firebaseConfig.appId]
 * @property {string} [firebaseConfig.measurementId]
 * @property {boolean} [useEmulators=false] - Whether to use Firebase emulators
 * @property {string} [emulatorHost='localhost'] - Emulator host
 * @property {number} [authPort=9099] - Auth emulator port
 * @property {number} [firestorePort=8080] - Firestore emulator port
 * @property {number} [storagePort=9199] - Storage emulator port
 * @property {string} [apiPrefix='/api'] - API prefix for service worker routes
 * @property {Object} [requireClaims] - Required auth claims for sign-in
 * @property {string} [broadcastChannelName='accelerant-events'] - BroadcastChannel name for SW -> tab events
 * @property {Object} [firestoreCache] - Firestore cache/listener configuration overrides
 */

/**
 * Main Accelerant class
 */
export default class Accelerant {
  /**
   * @param {AccelerantConfig} config
   */
  constructor(config = {}) {
    this.config = config;
    this.deferred = new Deferred();
  }

  /**
   * Register the service worker with Accelerant routes
   * @param {string} [scriptUrl='/sw.js'] - URL to the service worker script
   * @param {Object} [options] - Service worker registration options
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  async registerServiceWorker(scriptUrl = '/sw.js', options = {}) {
    if ('serviceWorker' in navigator) {
      try {
        const params = Object.entries(this.config).length ? flattenToParams(this.config) : null;
        if (params) {
          scriptUrl = `${scriptUrl}?${new URLSearchParams(params)}`;
        }
        const registration = await navigator.serviceWorker.register(scriptUrl, {
          scope: '/',
          type: 'module',
          ...options,
        });

        // Wait for the service worker to become active
        const installing = registration.installing;
        if (installing) {
          await new Promise((resolve) => {
            const maybeResolve = () => {
              if (installing.state === 'activated') {
                resolve();
              }
            };
            installing.addEventListener('statechange', maybeResolve);
            maybeResolve();
          });
        }

        if (!navigator.serviceWorker.controller) {
          await new Promise((resolve) => {
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
              once: true,
            });
          });
        }

        this.deferred.resolve(registration);

        return registration;
      } catch (error) {
        console.error('Service worker registration failed:', error);
        throw error;
      }
    } else {
      throw new Error('Service workers are not supported in this browser');
    }
  }

  /**
   * Wait for worker to be ready
   * @returns {Promise<void>}
   */
  async whenReady() {
    await this.deferred;
  }
}

/**
 * Convenience function to register service worker with default configuration
 * @param {AccelerantConfig} config
 * @param {string} [scriptUrl='/sw.js']
 * @param {Object} [options]
 * @returns {Promise<{accelerant: Accelerant, registration: ServiceWorkerRegistration}>}
 */
export async function registerServiceWorker(config, scriptUrl = '/sw.js', options = {}) {
  const accelerant = new Accelerant(config);
  const registration = await accelerant.registerServiceWorker(scriptUrl, options);
  return { accelerant, registration };
}
