import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request } from 'express';
import * as Sentry from '@sentry/node';
import { captureServerException } from './errorTracking';

const scope = {
  setTag: vi.fn(),
  setExtra: vi.fn(),
  setContext: vi.fn(),
  setUser: vi.fn(),
};

vi.mock('@sentry/node', () => ({
  isInitialized: vi.fn(),
  withScope: vi.fn((callback: (scopeArg: typeof scope) => void) => callback(scope)),
  captureException: vi.fn(),
}));

describe('server error tracking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not capture when Sentry is not initialized', () => {
    vi.mocked(Sentry.isInitialized).mockReturnValue(false);

    const captured = captureServerException(new Error('boom'), {
      method: 'GET',
      originalUrl: '/api/projects',
      url: '/api/projects',
      path: '/api/projects',
    } as Request);

    expect(captured).toBe(false);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('captures errors with request and user context', () => {
    vi.mocked(Sentry.isInitialized).mockReturnValue(true);
    const error = new Error('boom');

    const captured = captureServerException(error, {
      id: 'trace-1',
      method: 'GET',
      originalUrl: '/api/uploads/download?token=secret',
      url: '/api/uploads/download?token=secret',
      path: '/api/uploads/download',
      user: {
        id: 'user-1',
        username: 'atlas',
        realName: 'Atlas User',
        roles: [],
        permissions: [],
        collaboratingProjectIds: [],
      },
    } as unknown as Request);

    expect(captured).toBe(true);
    expect(scope.setTag).toHaveBeenCalledWith('trace_id', 'trace-1');
    expect(scope.setContext).toHaveBeenCalledWith('request', {
      method: 'GET',
      url: '/api/uploads/download?token=[Filtered]',
      path: '/api/uploads/download',
    });
    expect(scope.setUser).toHaveBeenCalledWith({
      id: 'user-1',
      username: 'atlas',
      name: 'Atlas User',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
