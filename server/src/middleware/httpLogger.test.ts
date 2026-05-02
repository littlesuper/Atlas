import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../utils/logger';
import { httpLogger } from './httpLogger';

class MockResponse extends EventEmitter {
  statusCode = 200;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    id: 'trace-123',
    method: 'GET',
    originalUrl: '/api/projects',
    ip: '127.0.0.1',
    get: vi.fn((header: string) => (header === 'user-agent' ? 'vitest-agent' : undefined)),
    user: {
      id: 'user-1',
      username: 'admin',
      realName: '管理员',
      roles: [],
      permissions: [],
      collaboratingProjectIds: [],
    },
    ...overrides,
  } as unknown as Request;
}

describe('httpLogger', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dateNowSpy = vi.spyOn(Date, 'now');
  });

  it('logs successful requests with trace_id, user_id, and structured context', () => {
    dateNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1250);
    const req = mockReq();
    const res = new MockResponse() as Response;
    const next = vi.fn() as NextFunction;

    httpLogger(req, res, next);
    (res as unknown as MockResponse).emit('finish');

    expect(next).toHaveBeenCalledWith();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        trace_id: 'trace-123',
        requestId: 'trace-123',
        user_id: 'user-1',
        context: {
          method: 'GET',
          url: '/api/projects',
          status_code: 200,
          duration_ms: 250,
          ip: '127.0.0.1',
          user_agent: 'vitest-agent',
        },
      }),
      'GET /api/projects 200 250ms'
    );
  });

  it('uses warn for 4xx responses and error for 5xx responses', () => {
    dateNowSpy.mockReturnValue(1000);

    const warnRes = new MockResponse() as Response;
    warnRes.statusCode = 404;
    httpLogger(mockReq(), warnRes, vi.fn() as NextFunction);
    (warnRes as unknown as MockResponse).emit('finish');

    const errorRes = new MockResponse() as Response;
    errorRes.statusCode = 500;
    httpLogger(mockReq(), errorRes, vi.fn() as NextFunction);
    (errorRes as unknown as MockResponse).emit('finish');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
});
