// Service Worker main entry point
// Sets up Workbox routing and registers all Accelerant routes
import { setCatchHandler } from 'workbox-routing';
import { FirestorePath } from '../request/firestore.js';
import WorkerRuntime from './runtime.js';
// shim for firebase-storage (doh!)
import '../shim/xhr.js';

// Import handlers
import {
  GetStrategyHandler as AuthGetHandler,
  PostStrategyHandler as AuthPostHandler,
} from '../strategy/handler/auth.js';
import {
  DeleteStrategyHandler as FirestoreDeleteHandler,
  GetStrategyHandler as FirestoreGetHandler,
  HeadStrategyHandler as FirestoreHeadHandler,
  PatchStrategyHandler as FirestorePatchHandler,
  PostStrategyHandler as FirestorePostHandler,
  PutStrategyHandler as FirestorePutHandler,
} from '../strategy/handler/firestore.js';
import { FunctionsStrategyHandler as FunctionsHandler } from '../strategy/handler/functions.js';
import {
  DeleteStrategyHandler as StorageDeleteHandler,
  GetStrategyHandler as StorageGetHandler,
  HeadStrategyHandler as StorageHeadHandler,
  PutStrategyHandler as StoragePutHandler,
} from '../strategy/handler/storage.js';
// Import strategies
import {
  CacheAfter,
  CacheFirst,
  CacheInvalidate,
  NetworkOnly,
  StaleWhileRevalidate,
} from '../strategy/index.js';

// Import plugins
import {
  AnnouncementWorkboxPlugin,
  CacheInvalidateWorkboxPlugin,
  CacheWorkboxPlugin,
  getCacheKey,
  IndexingWorkboxPlugin,
} from '../strategy/plugins/core.js';
import { FirestoreListenerWorkboxPlugin } from '../strategy/plugins/firestore.js';

const API_AUTH_PATH = 'auth';
const API_FIRESTORE_PATH = 'db';
// const API_SIGNALS_PATH = 'signals';
const API_FUNCTIONS_PATH = 'fn';
const API_STORAGE_PATH = 'fs';

/**
 * Register all Accelerant routes
 * @param {AccelerantConfig} config - Service worker config, see {@link AccelerantConfig}
 * @param {object} [routePaths] - The route paths after `/api` for each Firebase service
 */
export function registerRoutes(config, routePaths = {}) {
  if (!config) {
    throw new Error('Service worker config is required.');
  }

  const {
    auth = API_AUTH_PATH,
    firestore = API_FIRESTORE_PATH,
    // signals = API_SIGNALS_PATH,
    functions = API_FUNCTIONS_PATH,
    storage = API_STORAGE_PATH,
  } = routePaths;
  const runtime = new WorkerRuntime(config);

  if (auth) {
    registerAuthRoutes(auth, runtime);
  }
  if (firestore) {
    registerFirestoreRoutes(firestore, runtime);
  }
  // if (signals) {
  //   registerSignalRoutes(signals, runtime);
  // }
  if (functions) {
    registerFunctionRoutes(functions, runtime);
  }
  if (storage) {
    registerStorageRoutes(storage, runtime);
  }

  // Set up catch-all handler for unmatched routes
  setCatchHandler(({ request }) => {
    return runtime.response.json.notFound(`Route not found: ${request.url}`);
  });
}

/**
 * Register all auth routes
 * @param {string} apiPath
 * @param {WorkerRuntime} runtime
 */
function registerAuthRoutes(apiPath, runtime) {
  const cachePlugin = new CacheWorkboxPlugin(runtime);
  const announcementPlugin = new AnnouncementWorkboxPlugin(runtime, {
    eventNamespace: 'auth',
  });

  // Auth routes
  // ===========
  // GET /api/auth/status - Get auth status
  runtime.routeGet(apiPath, StaleWhileRevalidate, AuthGetHandler, {
    plugins: [cachePlugin],
  });

  // POST /api/auth/sign-in - Sign in with email/password
  runtime.routePost(`${apiPath}/sign-in`, CacheAfter, AuthPostHandler, {
    apiPath: runtime.getApiPath(apiPath),
    plugins: [cachePlugin, announcementPlugin],
  });

  // POST /api/auth/sign-out - Sign out
  runtime.routePost(`${apiPath}/sign-out`, CacheInvalidate, AuthPostHandler, {
    apiPath: runtime.getApiPath(apiPath),
    plugins: [cachePlugin, announcementPlugin],
  });
}

/**
 * Register all firestore routes
 * @param {string} apiPath
 * @param {WorkerRuntime} runtime
 */
function registerFirestoreRoutes(apiPath, runtime) {
  function keysFunc(request, _responseData, handler) {
    const path = new FirestorePath(request, handler.apiPath);
    const keys = [];

    keys.push(path.getCollectionPath().replace(/^\//, ''));

    if (path.isSubCollectionPath) {
      keys.push(path.getFirestoreCollectionGroupPath().getCollectionPath().replace(/^\//, ''));
    }

    return keys;
  }

  const cachePlugin = new CacheWorkboxPlugin(runtime);
  const idIndexPlugin = new IndexingWorkboxPlugin(runtime, {
    name: 'firestore.ids',
    fieldName: 'id',
  });
  const urlIndexPlugin = new IndexingWorkboxPlugin(runtime, {
    name: 'firestore.urls',
    keysFunc,
  });
  const announcementPlugin = new AnnouncementWorkboxPlugin(runtime, {
    eventNamespace: 'firestore',
  });
  const cacheInvalidatePlugin = new CacheInvalidateWorkboxPlugin(runtime, {
    async cacheKeyFunc(request, handler) {
      const requestUrls = new Set([request.url]);

      const urlsIndex = await urlIndexPlugin.getIndex(handler);

      for (const indexKey of keysFunc(request, {}, handler)) {
        // index keys are firestore paths
        requestUrls.add(getCacheKey({ url: `${handler.apiPath}/${indexKey}` }).url);
        const indexValues = (await urlsIndex.get(indexKey)) || [];
        for (const indexValue of indexValues) {
          // index values are full urls
          requestUrls.add(indexValue);
        }
      }

      return Array.from(requestUrls).map((url) => getCacheKey({ url }));
    },
  });
  const firestoreListenerPlugin = new FirestoreListenerWorkboxPlugin(runtime, {
    name: 'firestore.listeners',
  });

  // Firestore routes
  // ================
  // GET /api/db/{collection} - Get a collection
  // GET /api/db/{collection}.group - Get a collection group
  // GET /api/db/{collection}/{doc} - Get document by ID {doc}
  // GET /api/db/{collection}/{doc}/{subcollection} - Get document's sub collection
  runtime.routeGet(apiPath, CacheFirst, FirestoreGetHandler, {
    plugins: [idIndexPlugin, firestoreListenerPlugin, cachePlugin, urlIndexPlugin],
  });

  // HEAD /api/db/{collection}/{doc} - Check document existence
  runtime.routeHead(apiPath, CacheFirst, FirestoreHeadHandler, {
    plugins: [cachePlugin, urlIndexPlugin],
  });

  // POST /api/db/{collection} - Create document with random ID
  runtime.routePost(apiPath, CacheAfter, FirestorePostHandler, {
    plugins: [
      idIndexPlugin,
      cachePlugin,
      cacheInvalidatePlugin,
      urlIndexPlugin,
      announcementPlugin,
    ],
  });

  // PUT /api/db/{collection}/{doc} - Create document (fail if exists)
  runtime.routePut(apiPath, CacheAfter, FirestorePutHandler, {
    plugins: [
      idIndexPlugin,
      cachePlugin,
      cacheInvalidatePlugin,
      urlIndexPlugin,
      announcementPlugin,
    ],
  });

  // PATCH /api/db/{collection}/{doc} - Update document (merge)
  runtime.routePatch(apiPath, CacheAfter, FirestorePatchHandler, {
    plugins: [
      idIndexPlugin,
      cachePlugin,
      cacheInvalidatePlugin,
      urlIndexPlugin,
      announcementPlugin,
    ],
  });

  // DELETE /api/db/{collection}/{doc} - Delete document
  runtime.routeDelete(apiPath, CacheInvalidate, FirestoreDeleteHandler, {
    plugins: [
      idIndexPlugin,
      cachePlugin,
      cacheInvalidatePlugin,
      urlIndexPlugin,
      announcementPlugin,
    ],
  });
}

/**
 * Register all firestore routes
 * @param {string} apiPath
 * @param {WorkerRuntime} runtime
 */
function registerFunctionRoutes(apiPath, runtime) {
  runtime.routePost(apiPath, NetworkOnly, FunctionsHandler, {
    name: 'run_test',
  });
}

/**
 * Register all storage routes
 * @param {string} apiPath
 * @param {WorkerRuntime} runtime
 */
function registerStorageRoutes(apiPath, runtime) {
  const cachePlugin = new CacheWorkboxPlugin(runtime);
  const announcementPlugin = new AnnouncementWorkboxPlugin(runtime, {
    eventNamespace: 'storage',
  });

  // Storage routes
  // ==============
  // GET /api/fs/{path} - Download file
  runtime.routeGet(apiPath, CacheFirst, StorageGetHandler, {
    plugins: [cachePlugin],
  });

  // HEAD /api/fs/{path} - Check file existence
  runtime.routeHead(apiPath, CacheFirst, StorageHeadHandler, {
    plugins: [cachePlugin],
  });

  // PUT /api/fs/{path} - Upload file
  runtime.routePut(apiPath, CacheAfter, StoragePutHandler, {
    plugins: [announcementPlugin],
  });

  // DELETE /api/fs/{path} - Delete file
  runtime.routeDelete(apiPath, CacheInvalidate, StorageDeleteHandler, {
    plugins: [announcementPlugin],
  });
}

// Service worker event listeners
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  // Take control of all clients immediately
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (_event) => {
  // Let Workbox handle the fetch event
  // Routes will be matched and handled by the registered routes
});
