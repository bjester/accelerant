# Accelerant
[![Unit tests](https://github.com/bjester/accelerant/actions/workflows/unit-tests.yml/badge.svg?branch=main)](https://github.com/bjester/accelerant/actions/workflows/unit-tests.yml)
[![Integration](https://github.com/bjester/accelerant/actions/workflows/integration-tests.yml/badge.svg?branch=main)](https://github.com/bjester/accelerant/actions/workflows/integration-tests.yml)
[![E2E](https://github.com/bjester/accelerant/actions/workflows/e2e-tests.yml/badge.svg?branch=main)](https://github.com/bjester/accelerant/actions/workflows/e2e-tests.yml)
[![Lint](https://github.com/bjester/accelerant/actions/workflows/lint.yml/badge.svg?branch=main)](https://github.com/bjester/accelerant/actions/workflows/lint.yml)
![NPM Version](https://img.shields.io/npm/v/accelerant)

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
import { registerRoutes } from 'accelerant/sw';

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

## Development setup

Install [uv](https://docs.astral.sh/uv/getting-started/installation/) and [Node.js](https://nodejs.org/) (v22+), then:

```bash
# Install JS dependencies
pnpm install

# Install and register pre-commit hooks
uv tool install prek
prek install
```

After setup, commits will automatically run Biome (lint + format). If Biome modifies any files, the commit is blocked — review the diff, `git add` the changes, and commit again.

### Lint and format

```bash
pnpm lint        # check only
pnpm lint:fix    # check and auto-fix
pnpm format      # format only
```

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
