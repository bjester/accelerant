import { registerRoutes } from '/src/sw/worker.js';

registerRoutes({
  firebaseConfig: {
    apiKey: 'demo',
    appId: 'demo',
    projectId: 'demo-accelerant',
    storageBucket: 'demo-accelerant.appspot.com'
  },
  useEmulators: true,
  emulatorHost: '127.0.0.1',
  authPort: 9099,
  firestorePort: 8080,
  storagePort: 9199,
  apiPrefix: '/api',
  requireClaims: null,
  broadcastChannelName: 'accelerant-e2e',
  firestoreCache: {
    minHits: 1
  }
});
