import { defineConfig } from 'vitest/config';

const testFeatureFlagOverrides = JSON.stringify({
  'atlas.ai.assistance': true,
  'atlas.wecom.login': true,
  'atlas.project.templates': true,
  'atlas.risk.dashboard': true,
  'atlas.workload.dashboard': true,
  'atlas.holiday.management': true,
});

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    env: {
      FEATURE_FLAG_OVERRIDES: testFeatureFlagOverrides,
    },
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'html'],
      exclude: ['src/prisma/**'],
    },
  },
});
