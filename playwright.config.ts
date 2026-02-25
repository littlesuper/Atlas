import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:5176',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      testDir: './e2e',
    },
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        storageState: 'e2e/.auth/state.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      cwd: './server',
      port: 3000,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      cwd: './client',
      port: 5176,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
