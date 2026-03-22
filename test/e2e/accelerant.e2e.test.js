import { expect, test } from '@playwright/test';

import { createUser, teardown } from '../fixtures/auth.js';

async function collectStartupDiagnostics(page) {
  return await page.evaluate(async () => {
    const registrations = await navigator.serviceWorker
      .getRegistrations()
      .then((list) =>
        list.map((registration) => ({
          active: registration.active?.scriptURL ?? null,
          installing: registration.installing?.scriptURL ?? null,
          waiting: registration.waiting?.scriptURL ?? null,
          scope: registration.scope,
        })),
      )
      .catch((error) => ({ error: error?.message ?? String(error) }));

    return {
      readyState: document.readyState,
      url: location.href,
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      registrations,
      accelerantReadyError: window.__accelerantReadyError ?? null,
    };
  });
}

function isRetryableStartupError(error) {
  const message = error?.message ?? String(error);
  return message.includes('Execution context was destroyed');
}

async function waitForAccelerantStartup(page, attempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.waitForFunction(() => window.accelerantReady !== undefined);
      await page.evaluate(() => window.accelerantReady);
      await page.waitForFunction(() => {
        return navigator.serviceWorker.controller?.scriptURL.includes('/sw.js');
      });
      return;
    } catch (error) {
      lastError = error;
      if (!isRetryableStartupError(error) || attempt === attempts) {
        throw error;
      }
      await page.waitForLoadState('domcontentloaded');
    }
  }
  throw lastError;
}

test.describe('accelerant e2e test', () => {
  test.afterAll(async () => {
    await teardown();
  });

  test('e2e auth + firestore + storage', async ({ context, page }, testInfo) => {
    const runtimeLogs = [];
    page.on('console', (message) => {
      runtimeLogs.push(`[console:${message.type()}] ${message.text()}`);
    });
    page.on('pageerror', (error) => {
      runtimeLogs.push(`[pageerror] ${error?.stack ?? error?.message ?? String(error)}`);
    });
    context.on('serviceworker', (worker) => {
      runtimeLogs.push(`[serviceworker] ${worker.url()}`);
    });

    const email = `e2e-${Date.now()}@example.com`;
    const password = 'password123!';
    await createUser({ email, password });

    try {
      await page.goto('/');
      await waitForAccelerantStartup(page);
    } catch (error) {
      const startup = await collectStartupDiagnostics(page).catch((diagError) => ({
        error: diagError?.message ?? String(diagError),
      }));
      const payload = { startup, runtimeLogs };
      await testInfo.attach('startup-diagnostics', {
        body: JSON.stringify(payload, null, 2),
        contentType: 'application/json',
      });
      console.error('startup-diagnostics', JSON.stringify(payload, null, 2));
      throw error;
    }

    const signIn = await page.evaluate(
      async ({ email, password }) => {
        return window.accelerantApi.auth.signIn(email, password);
      },
      { email, password },
    );
    expect(signIn.status).toBe(200);

    await page.waitForFunction(() => {
      return window.__getAuthIndicatorState?.().includes('signed-in');
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
    expect(list.body.length).toBeGreaterThan(0);

    const put = await page.evaluate(async () => {
      return window.accelerantApi.storage.put('fixtures/e2e.txt', 'hello storage', 'text/plain');
    });
    expect(put.status).toBe(201);

    const head = await page.evaluate(async () => {
      return window.accelerantApi.storage.head('fixtures/e2e.txt');
    });
    expect(head.status).toBe(204);

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
      return window.__getAuthIndicatorState?.().includes('signed-out');
    });
  });
});
