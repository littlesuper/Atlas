import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const sentryRelease = env.SENTRY_RELEASE || env.VITE_APP_VERSION;
  const shouldUploadSourcemaps = Boolean(
    env.SENTRY_AUTH_TOKEN &&
    env.SENTRY_ORG &&
    env.SENTRY_PROJECT &&
    sentryRelease
  );

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(shouldUploadSourcemaps
        ? sentryVitePlugin({
            authToken: env.SENTRY_AUTH_TOKEN,
            org: env.SENTRY_ORG,
            project: env.SENTRY_PROJECT,
            release: {
              name: sentryRelease,
              setCommits: { auto: true },
            },
            sourcemaps: {
              filesToDeleteAfterUpload: 'dist/**/*.map',
            },
            telemetry: false,
          })
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      sourcemap: shouldUploadSourcemaps ? 'hidden' : false,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
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
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3000',
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
    },
  };
});
