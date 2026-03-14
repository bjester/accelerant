import { initializeApp as initAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import {getAuth as getAdminAuth} from "firebase-admin/auth";

let app = null;

function _getAdminAuth() {
  if (!app) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-accelerant';
    app = initAdminApp({projectId}, `user-${Date.now()}`);
  }
  return getAdminAuth(app);
}

export async function teardown() {
  if (app) {
    await deleteAdminApp(app);
    app = null;
  }
}

export async function createUser({ email, password, disabled = false }, customClaims = null) {
  const adminAuth = _getAdminAuth();
  const userRecord = await adminAuth.createUser({ email, password, disabled });
  if (customClaims) {
    await adminAuth.setCustomUserClaims(userRecord.uid, customClaims);
  }
  return userRecord.uid;
}

export async function createAdminUser({ email, password }) {
  return createUser({ email, password }, { admin: true });
}

export async function createDisabledUser({ email, password }) {
  return createUser({ email, password, disabled: true });
}