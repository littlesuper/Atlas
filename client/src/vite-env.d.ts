/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_UNLEASH_FRONTEND_URL?: string;
  readonly VITE_UNLEASH_FRONTEND_TOKEN?: string;
  readonly VITE_UNLEASH_APP_NAME?: string;
  readonly VITE_UNLEASH_ENVIRONMENT?: string;
  readonly VITE_UNLEASH_REFRESH_INTERVAL?: string;
  readonly VITE_FEATURE_FLAG_OVERRIDES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
