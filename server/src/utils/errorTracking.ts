import type { Request } from 'express';
import * as Sentry from '@sentry/node';

const sanitizeUrl = (url: string): string =>
  url.replace(/([?&](?:token|accessToken|refreshToken)=)[^&]+/gi, '$1[Filtered]');

export const captureServerException = (error: unknown, req: Request): boolean => {
  if (!Sentry.isInitialized()) {
    return false;
  }

  Sentry.withScope((scope) => {
    if (req.id) {
      scope.setTag('trace_id', req.id);
      scope.setExtra('requestId', req.id);
    }

    scope.setContext('request', {
      method: req.method,
      url: sanitizeUrl(req.originalUrl || req.url),
      path: req.path,
    });

    if (req.user) {
      scope.setUser({
        id: req.user.id,
        username: req.user.username || undefined,
        name: req.user.realName,
      });
    }

    Sentry.captureException(error);
  });

  return true;
};
