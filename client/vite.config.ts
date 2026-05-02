import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import path from 'path';
import { readFileSync } from 'fs';

const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';
const rootPackage = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8')) as {
  version?: string;
};
const appVersion = rootPackage.version || '0.0.0';
const sentryRelease = process.env.VITE_SENTRY_RELEASE || process.env.SENTRY_RELEASE || `atlas@${appVersion}`;
const shouldUploadSentrySourcemaps = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default defineConfig({
  plugins: [
    react(),
    ...(shouldUploadSentrySourcemaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
              name: sentryRelease,
              inject: true,
              create: true,
              finalize: true,
            },
            sourcemaps: {
              filesToDeleteAfterUpload: ['dist/**/*.map'],
            },
          }),
        ]
      : []),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    sourcemap: shouldUploadSentrySourcemaps,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-arco': ['@arco-design/web-react'],
          'vendor-echarts': ['echarts', 'echarts-for-react'],
          'vendor-editor': ['@wangeditor/editor', '@wangeditor/editor-for-react'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  // @ts-expect-error vitest config merged into vite config
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reportsDirectory: './coverage',
      reporter: ['text', 'json-summary', 'html'],
      exclude: ['src/test/**'],
    },
  },
});
