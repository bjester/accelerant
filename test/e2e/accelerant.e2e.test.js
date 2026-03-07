import { test, expect } from '@playwright/test';
import { initializeApp as initAdminApp, deleteApp as deleteAdminApp } from 'firebase-admin/app';
import {getAuth as getAdminAuth} from "firebase-admin/auth";

const projectId = 'demo-accelerant';

async function createUser({ email, password }) {
  const app = initAdminApp({ projectId });
  const adminAuth = getAdminAuth(app);
  const userRecord = await adminAuth.createUser({ email, password });
  await deleteAdminApp(app);
  return userRecord.uid;
}

test('e2e auth + firestore + storage', async ({ page, request }) => {
  const email = `e2e@example.com`;
  const password = 'password123!';
  await createUser({ email, password });

  await page.goto('/');
  await page.waitForFunction(() => window.accelerantReady !== undefined);
  await page.evaluate(() => window.accelerantReady);
  await page.waitForFunction(() => {
    return navigator.serviceWorker.controller &&
      navigator.serviceWorker.controller.scriptURL.endsWith('/sw.js');
  });

  const signIn = await page.evaluate(async ({ email, password }) => {
    return window.accelerantApi.auth.signIn(email, password);
  }, { email, password });
  expect(signIn.status).toBe(200);

  await page.waitForFunction(() => {
    return window.__getAuthIndicatorState && window.__getAuthIndicatorState().includes('signed-in');
  });

  const created = await page.evaluate(async () => {
    return window.accelerantApi.firestore.post('e2e-items', { name: 'hello' });
  });
  expect(created.status).toBe(201);
  expect(created.body.id).toBeTruthy();

  const list = await page.evaluate(async () => {
    return window.accelerantApi.firestore.list('e2e-items');
  });
  expect(list.status).toBe(200);
  expect(Array.isArray(list.body)).toBeTruthy();

  await page.waitForFunction(() => {
    return window.__getFirestoreIndicatorState &&
      window.__getFirestoreIndicatorState().includes('Firestore cache') &&
      !window.__getFirestoreIndicatorState().includes('none');
  });

  const put = await page.evaluate(async () => {
    return window.accelerantApi.storage.put('fixtures/e2e.txt', 'hello storage', 'text/plain');
  });
  expect(put.status).toBe(201);

  const head = await page.evaluate(async () => {
    return window.accelerantApi.storage.head('fixtures/e2e.txt');
  });
  expect(head.status).toBe(204);
  expect(head.headers['content-type']).toBe('text/plain');

  const get = await page.evaluate(async () => {
    return window.accelerantApi.storage.get('fixtures/e2e.txt');
  });
  expect(get.status).toBe(200);
  expect(get.body).toContain('hello storage');

  const signOut = await page.evaluate(async () => {
    return window.accelerantApi.auth.signOut();
  });
  expect(signOut.status).toBe(200);

  await page.waitForFunction(() => {
    return window.__getAuthIndicatorState && window.__getAuthIndicatorState().includes('signed-out');
  });
});
