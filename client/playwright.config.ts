import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:8787',
    channel: 'chrome',
    viewport: { width: 720, height: 1280 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --dir ../server dev',
    url: 'http://127.0.0.1:8787',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
