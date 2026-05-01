import { defineConfig, type BrowserName } from '@playwright/test';

const serverPort = Number(process.env.E2E_SERVER_PORT || process.env.PORT || 3000);
const clientPort = Number(process.env.E2E_CLIENT_PORT || 5173);
const authStatePath = 'e2e/.auth/state.json';
const browserNames = ['chromium', 'firefox', 'webkit'] satisfies BrowserName[];

export default defineConfig({
  globalTeardown: './e2e/global-teardown.ts',
  testDir: './e2e/specs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://localhost:${clientPort}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      testDir: './e2e',
    },
    ...browserNames.map((browserName) => ({
      name: browserName,
      use: {
        browserName,
        storageState: authStatePath,
      },
      dependencies: ['setup'],
    })),
  ],
  webServer: [
    {
      command: 'npm run start',
      cwd: './server',
      env: { ...process.env, PORT: String(serverPort) },
      port: serverPort,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npm run dev -- --port ${clientPort}`,
      cwd: './client',
      env: { ...process.env, VITE_API_PROXY_TARGET: `http://localhost:${serverPort}` },
      port: clientPort,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});
