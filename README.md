# Accelerant

Accelerant exposes Firebase Auth, Firestore, and Storage through a service worker API so your frontend can use `fetch` without importing the Firebase SDK.

## Usage

### App (register the service worker)

```js
import { registerServiceWorker } from 'accelerant';

await registerServiceWorker({
  // TBD
});
```

### Service worker

```js
import { registerRoutes } from 'accelerant/src/sw/worker.js';

registerRoutes({
  firebaseConfig: {
    apiKey: '...'
    // other firebase config fields
  },
  apiPrefix: '/api',
  requireClaims: { admin: true }
});
```

## Auth claim requirements

The `requireClaims` option controls which custom claims a user must have to sign in.

Accepted forms:
- Object: `{ admin: true, tier: 'pro' }`
- Array: `['admin', 'beta']` (equivalent to all `true`)

If `requireClaims` is omitted or `null`, any valid user can sign in.

## E2E testing

E2E uses Playwright + Vite and runs against Firebase emulators.

Install dependencies and browsers:

```bash
pnpm install
pnpm exec playwright install
```

Run the automated E2E suite:

```bash
pnpm test:e2e
```

Open the manual test page:

```bash
pnpm exec vite --config test/e2e/vite.config.js
```

Then visit `http://localhost:4173` and use the buttons to exercise Auth/Firestore/Storage.
