import * as Sentry from '@sentry/react';

type ErrorContext = {
  tags?: Record<string, string | number | boolean | undefined>;
  extra?: Record<string, unknown>;
};

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
const tracesSampleRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0);

export const isMonitoringEnabled = Boolean(sentryDsn);

export function initMonitoring() {
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    sendDefaultPii: false,
  });
}

export function captureAppError(error: unknown, context?: ErrorContext) {
  if (!isMonitoringEnabled) return;

  Sentry.withScope((scope) => {
    Object.entries(context?.tags ?? {}).forEach(([key, value]) => {
      if (value !== undefined) scope.setTag(key, String(value));
    });

    if (context?.extra) {
      scope.setContext('extra', context.extra);
    }

    Sentry.captureException(error);
  });
}
