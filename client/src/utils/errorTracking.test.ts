import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';
import {
  addErrorTrackingBreadcrumb,
  captureFrontendException,
  sanitizeTrackingUrl,
  setErrorTrackingUser,
} from './errorTracking';

vi.mock('@sentry/react', () => ({
  isInitialized: vi.fn(),
  setUser: vi.fn(),
  addBreadcrumb: vi.fn(),
  withScope: vi.fn((callback: (scope: { setTag: ReturnType<typeof vi.fn>; setExtra: ReturnType<typeof vi.fn> }) => void) =>
    callback({ setTag: vi.fn(), setExtra: vi.fn() })
  ),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(),
  init: vi.fn(),
}));

describe('errorTracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters token-like query parameters from breadcrumb URLs', () => {
    expect(sanitizeTrackingUrl('/api/file?token=secret&name=a')).toBe('/api/file?token=[Filtered]&name=a');
    expect(sanitizeTrackingUrl('/api/auth?accessToken=a&refreshToken=b')).toBe(
      '/api/auth?accessToken=[Filtered]&refreshToken=[Filtered]'
    );
  });

  it('sets and clears user context only after Sentry is initialized', () => {
    vi.mocked(Sentry.isInitialized).mockReturnValue(false);
    setErrorTrackingUser({ id: 'u1', username: 'atlas', realName: 'Atlas User' });
    expect(Sentry.setUser).not.toHaveBeenCalled();

    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    setErrorTrackingUser({ id: 'u1', username: 'atlas', realName: 'Atlas User' });
    setErrorTrackingUser(null);

    expect(Sentry.setUser).toHaveBeenNthCalledWith(1, {
      id: 'u1',
      username: 'atlas',
      name: 'Atlas User',
    });
    expect(Sentry.setUser).toHaveBeenNthCalledWith(2, null);
  });

  it('records breadcrumbs only after Sentry is initialized', () => {
    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    addErrorTrackingBreadcrumb({ category: 'auth', message: 'User signed in' });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({ category: 'auth', message: 'User signed in' });
  });

  it('captures exceptions with scoped tags and extras', () => {
    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    const error = new Error('boom');

    captureFrontendException(error, {
      tags: { source: 'react_error_boundary' },
      extra: { componentStack: 'stack' },
    });

    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
