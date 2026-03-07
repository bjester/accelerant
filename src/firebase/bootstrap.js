// Firebase initialization and configuration
// Handles app setup, emulator configuration, and resource provisioning

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

/**
 * Firebase initialization result
 * @typedef {Object} FirebaseInstance
 * @property {import("firebase/app").FirebaseApp} app - Firebase app instance
 * @property {import("firebase/auth").Auth} auth - Firebase Auth instance
 * @property {import("firebase/firestore").Firestore} firestore - Firebase Firestore instance
 * @property {import("firebase/functions").Functions} functions - Firebase Firestore instance
 * @property {import("firebase/storage").FirebaseStorage} storage - Firebase Storage instance
 * @property {Promise<void>} ready - Promise that resolves when Firebase is ready
 */

/**
 * Global Firebase instance
 * @type {FirebaseInstance|null}
 */
let firebaseInstance = null;

/**
 * Initialize Firebase with configuration
 * @param {Object} config
 * @param {Object} config.firebaseConfig - Firebase configuration object
 * @param {boolean} [config.useEmulators=false] - Whether to use Firebase emulators
 * @param {string} [config.emulatorHost='localhost'] - Emulator host
 * @param {number} [config.authPort=9099] - Auth emulator port
 * @param {number} [config.firestorePort=8080] - Firestore emulator port
 * @param {number} [config.storagePort=9199] - Storage emulator port
 * @returns {FirebaseInstance}
 */
export function initializeFirebase(config = {}) {
  if (firebaseInstance) {
    return firebaseInstance;
  }
  
  const {
    firebaseConfig,
    useEmulators = false,
    emulatorHost = 'localhost',
    authPort = 9099,
    firestorePort = 8080,
    functionsPort = 8080,
    storagePort = 9199
  } = config;
  
  if (!firebaseConfig) {
    throw new Error('Firebase configuration is required');
  }
  
  // Initialize Firebase app
  const app = initializeApp(firebaseConfig);
  
  // Get Firebase services
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app);
  const storage = getStorage(app);

  // Optional promise to override to control when Firebase is ready
  // This is an artifact of Firestore having async persistence setup, which complicated bootstrap
  let readyPromise = Promise.resolve();

  // Configure emulators if enabled
  if (useEmulators) {
    // Connect to Auth emulator
    connectAuthEmulator(auth, `http://${emulatorHost}:${authPort}`);
    
    // Connect to Firestore emulator
    connectFirestoreEmulator(firestore, emulatorHost, firestorePort);

    // Connect to Functions emulator
    connectFunctionsEmulator(functions, emulatorHost, functionsPort);
    
    // Connect to Storage emulator
    connectStorageEmulator(storage, emulatorHost, storagePort);
  }
  
  // Create the Firebase instance
  firebaseInstance = {
    app,
    auth,
    firestore,
    functions,
    storage,
    ready: readyPromise
  };
  
  return firebaseInstance;
}

/**
 * Get the initialized Firebase instance
 * @returns {FirebaseInstance}
 */
export function getFirebase() {
  if (!firebaseInstance) {
    throw new Error('Firebase not initialized. Call initializeFirebase() first.');
  }
  return firebaseInstance;
}
