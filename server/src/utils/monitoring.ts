import * as Sentry from '@sentry/node';
import type { Request } from 'express';

type ErrorContext = {
  requestId?: string;
  tags?: Record<string, string | number | boolean | undefined>;
  extra?: Record<string, unknown>;
  req?: Request;
};

const sentryDsn = process.env.SENTRY_DSN;
const tracesSampleRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0);

export const isMonitoringEnabled = Boolean(sentryDsn);

export function initMonitoring() {
  if (!sentryDsn) return;

  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    sendDefaultPii: false,
  });
}

export function captureServerError(error: unknown, context?: ErrorContext) {
  if (!isMonitoringEnabled) return;

  Sentry.withScope((scope) => {
    if (context?.requestId) scope.setTag('requestId', context.requestId);

    Object.entries(context?.tags ?? {}).forEach(([key, value]) => {
      if (value !== undefined) scope.setTag(key, String(value));
    });

    if (context?.req) {
      scope.setContext('request', {
        method: context.req.method,
        url: context.req.originalUrl,
        requestId: context.req.id,
        ip: context.req.ip,
        userAgent: context.req.get('user-agent'),
      });
    }

    if (context?.extra) {
      scope.setContext('extra', context.extra);
    }

    Sentry.captureException(error);
  });
}

export async function flushMonitoring(timeoutMs = 2000) {
  if (!isMonitoringEnabled) return;
  await Sentry.flush(timeoutMs);
}
