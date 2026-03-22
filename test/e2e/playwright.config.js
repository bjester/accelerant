import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: path.dirname(fileURLToPath(import.meta.url)),
  testMatch: ['**/*.e2e.test.js'],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command:
      'pnpm exec vite build --config test/e2e/vite.config.js && pnpm exec vite preview --config test/e2e/vite.config.js --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
});
