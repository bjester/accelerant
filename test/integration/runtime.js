import { getApps, deleteApp } from 'firebase/app';
import { terminate } from 'firebase/firestore';

let runtimeInstance = null;

function getHostPort(envValue, defaultHost, defaultPort) {
  if (!envValue) return { host: defaultHost, port: defaultPort };
  const [host, port] = envValue.split(':');
  return { host, port: Number(port) };
}

async function createRuntime() {
  const { default: WorkerRuntime } = await import('../../src/sw/runtime.js');
  const authHost = getHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1', 9099);
  const fsHost = getHostPort(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1', 8080);
  const storageHost = getHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, fsHost.host, 9199);

  // WorkerRuntime uses a single host and per-service ports. In tests, these hosts are expected to match.
  const emulatorHost = fsHost.host || authHost.host || storageHost.host || '127.0.0.1';
  return new WorkerRuntime({
    firebaseConfig: {
      projectId: process.env.FIREBASE_PROJECT_ID || 'demo-accelerant',
      apiKey: 'demo',
      appId: 'demo',
      storageBucket: `${process.env.FIREBASE_PROJECT_ID || 'demo-accelerant'}.appspot.com`
    },
    useEmulators: true,
    emulatorHost,
    authPort: authHost.port,
    firestorePort: fsHost.port,
    storagePort: storageHost.port,
  });
}

export async function getIntegrationRuntime(onlyIfCreated = false) {
  if (runtimeInstance) {
    await runtimeInstance.ready();
    return runtimeInstance;
  }
  if (onlyIfCreated) return null;

  runtimeInstance = await createRuntime();
  await runtimeInstance.ready();
  return runtimeInstance;
}

export async function cleanupIntegrationRuntime() {
  if (runtimeInstance?.firebase?.firestore) {
    await terminate(runtimeInstance.firebase.firestore);
  }

  const apps = getApps();
  if (apps.length) {
    await Promise.all(apps.map((app) => deleteApp(app)));
  }

  runtimeInstance = null;
}

export function hasEmulatorEnv() {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}
