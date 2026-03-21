// Main library entry point
// Provides service worker registration and core functionality

import { initializeFirebase } from './firebase/bootstrap.js';

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
class Accelerant {
  /**
   * @param {AccelerantConfig} config
   */
  constructor(config = {}) {
    this.config = {
      useEmulators: false,
      emulatorHost: 'localhost',
      authPort: 9099,
      firestorePort: 8080,
      storagePort: 9199,
      apiPrefix: '/api',
      requireClaims: null,
      broadcastChannelName: 'accelerant-events',
      firestoreCache: undefined,
      ...config,
    };

    // Initialize Firebase
    this.firebase = initializeFirebase(this.config);
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
   * Get the Firebase app instance
   * @returns {import("firebase/app").FirebaseApp}
   */
  get app() {
    return this.firebase.app;
  }

  /**
   * Get the Firebase Auth instance
   * @returns {import("firebase/auth").Auth}
   */
  get auth() {
    return this.firebase.auth;
  }

  /**
   * Get the Firebase Firestore instance
   * @returns {import("firebase/firestore").Firestore}
   */
  get firestore() {
    return this.firebase.firestore;
  }

  /**
   * Get the Firebase Storage instance
   * @returns {import("firebase/storage").FirebaseStorage}
   */
  get storage() {
    return this.firebase.storage;
  }

  /**
   * Wait for Firebase to be ready
   * @returns {Promise<void>}
   */
  async whenReady() {
    await this.firebase.ready;
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

// Export the main class
export default Accelerant;

export { registerRoutes } from './sw/worker.js';
// Export individual components for advanced usage
export { Accelerant };
