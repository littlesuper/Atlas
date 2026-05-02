import * as Sentry from '@sentry/react';
import type { User } from '../types';

const DEFAULT_TRACES_SAMPLE_RATE = 0.1;

type Breadcrumb = Parameters<typeof Sentry.addBreadcrumb>[0];

interface CaptureContext {
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

const toSampleRate = (value: string | undefined): number => {
  if (!value) return DEFAULT_TRACES_SAMPLE_RATE;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }
  return parsed;
};

export const sanitizeTrackingUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  return url.replace(/([?&](?:token|accessToken|refreshToken)=)[^&]+/gi, '$1[Filtered]');
};

export const getErrorTrackingRelease = (): string =>
  import.meta.env.VITE_SENTRY_RELEASE || `atlas@${__APP_VERSION__}`;

export const initErrorTracking = (): boolean => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const isTest = import.meta.env.MODE === 'test';

  if (!dsn || isTest || Sentry.isInitialized()) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: getErrorTrackingRelease(),
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: toSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE),
  });

  return true;
};

export const setErrorTrackingUser = (user: Pick<User, 'id' | 'username' | 'realName'> | null): void => {
  if (!Sentry.isInitialized()) return;

  Sentry.setUser(
    user
      ? {
          id: user.id,
          username: user.username,
          name: user.realName,
        }
      : null
  );
};

export const addErrorTrackingBreadcrumb = (breadcrumb: Breadcrumb): void => {
  if (!Sentry.isInitialized()) return;
  Sentry.addBreadcrumb(breadcrumb);
};

export const captureFrontendException = (error: unknown, context: CaptureContext = {}): void => {
  if (!Sentry.isInitialized()) return;

  Sentry.withScope((scope) => {
    Object.entries(context.tags ?? {}).forEach(([key, value]) => scope.setTag(key, value));
    Object.entries(context.extra ?? {}).forEach(([key, value]) => scope.setExtra(key, value));
    Sentry.captureException(error);
  });
};
