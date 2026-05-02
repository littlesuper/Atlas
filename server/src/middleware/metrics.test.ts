import { EventEmitter } from 'events';
import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/metrics', () => ({
  recordHttpRequest: vi.fn(),
}));

import { recordHttpRequest } from '../utils/metrics';
import { metricsMiddleware } from './metrics';

class MockResponse extends EventEmitter {
  statusCode = 200;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/projects/123',
    baseUrl: '/api/projects',
    route: { path: '/:id' },
    path: '/123',
    ...overrides,
  } as unknown as Request;
}

describe('metricsMiddleware', () => {
  let dateNowSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    dateNowSpy = vi.spyOn(Date, 'now');
  });

  it('records request metrics with normalized route labels', () => {
    dateNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1450);
    const req = mockReq();
    const res = new MockResponse() as Response;
    const next = vi.fn() as NextFunction;

    metricsMiddleware(req, res, next);
    (res as unknown as MockResponse).emit('finish');

    expect(next).toHaveBeenCalledWith();
    expect(recordHttpRequest).toHaveBeenCalledWith({
      method: 'GET',
      route: '/api/projects/:id',
      statusCode: 200,
      durationMs: 450,
    });
  });

  it('uses a low-cardinality unmatched route label for 404 responses', () => {
    dateNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1010);
    const req = mockReq({
      baseUrl: '',
      route: undefined,
      path: '/api/unknown/123',
    });
    const res = new MockResponse() as Response;
    res.statusCode = 404;

    metricsMiddleware(req, res, vi.fn() as NextFunction);
    (res as unknown as MockResponse).emit('finish');

    expect(recordHttpRequest).toHaveBeenCalledWith({
      method: 'GET',
      route: 'unmatched',
      statusCode: 404,
      durationMs: 10,
    });
  });
});
