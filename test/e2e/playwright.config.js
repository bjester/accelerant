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
    serviceWorkers: 'allow'
  },
  webServer: {
    command: 'pnpm exec vite --config test/e2e/vite.config.js',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  }
});
