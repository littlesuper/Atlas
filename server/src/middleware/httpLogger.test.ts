import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { httpLogger } from './httpLogger';
import { logger } from '../utils/logger';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    ip: '127.0.0.1',
    id: 'req-123',
    get: vi.fn(() => 'test-agent'),
    ...overrides,
  } as unknown as Request;
}

function mockRes(statusCode = 200): Response {
  const res: Partial<Response> = {
    statusCode,
    on: vi.fn((event: string, cb: () => void) => {
      if (event === 'finish') cb();
      return res as Response;
    }),
  };
  return res as Response;
}

describe('httpLogger middleware', () => {
  let next: NextFunction & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    vi.clearAllMocks();
  });

  it('logs info for 2xx responses', () => {
    const req = mockReq();
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', statusCode: 200, requestId: 'req-123' }),
      expect.stringContaining('GET /api/test 200'),
    );
    expect(next).toHaveBeenCalled();
  });

  it('logs warn for 4xx responses', () => {
    const req = mockReq();
    const res = mockRes(404);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404 }),
      expect.stringContaining('404'),
    );
  });

  it('logs error for 5xx responses', () => {
    const req = mockReq();
    const res = mockRes(500);

    httpLogger(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
      expect.stringContaining('500'),
    );
  });

  it('includes duration in the log entry', () => {
    const req = mockReq();
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ duration: expect.stringMatching(/\d+ms/) }),
      expect.any(String),
    );
  });

  it('logs request IP address', () => {
    const req = mockReq({ ip: '10.0.0.1' });
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '10.0.0.1' }),
      expect.any(String),
    );
  });

  it('logs POST method correctly', () => {
    const req = mockReq({ method: 'POST', originalUrl: '/api/users' });
    const res = mockRes(201);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'POST' }),
      expect.stringContaining('POST /api/users 201'),
    );
  });

  it('includes user agent in log entry', () => {
    const req = mockReq();
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: 'test-agent' }),
      expect.any(String),
    );
  });

  it('logs warn for 400 responses', () => {
    const req = mockReq();
    const res = mockRes(400);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
      expect.any(String),
    );
  });

  it('logs info for 3xx responses', () => {
    const req = mockReq();
    const res = mockRes(302);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 302 }),
      expect.any(String),
    );
  });

  it('handles missing request id gracefully', () => {
    const req = mockReq({ id: undefined } as unknown as Partial<Request>);
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: undefined }),
      expect.any(String),
    );
  });

  it('calls next immediately without waiting for finish', () => {
    const req = mockReq();
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalled();
  });

  it('logs URL path correctly', () => {
    const req = mockReq({ originalUrl: '/api/projects?page=1' });
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/projects?page=1' }),
      expect.any(String),
    );
  });

  it('handles undefined IP address', () => {
    const req = mockReq({ ip: undefined } as unknown as Partial<Request>);
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ip: undefined }),
      expect.any(String),
    );
  });

  it('handles missing user-agent header', () => {
    const req = mockReq({ get: vi.fn(() => undefined) } as unknown as Partial<Request>);
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: undefined }),
      expect.any(String),
    );
  });

  it('logs warn for 499 status code', () => {
    const req = mockReq();
    const res = mockRes(499);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 499 }),
      expect.any(String),
    );
  });

  it('does not log until finish event fires', () => {
    const req = mockReq();
    const res: Partial<Response> = {
      statusCode: 200,
      on: vi.fn(() => res as Response),
    };

    httpLogger(req, res as Response, next);

    expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function));
    expect(logger.info).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('uses the status code at finish time not at middleware setup time', () => {
    const req = mockReq();
    let finishCb: (() => void) | undefined;
    const res: Partial<Response> = {
      statusCode: 200,
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'finish') finishCb = cb;
        return res as Response;
      }),
    };

    httpLogger(req, res as Response, next);

    expect(logger.info).not.toHaveBeenCalled();

    (res as Record<string, unknown>).statusCode = 500;
    finishCb!();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
      expect.stringContaining('500'),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs info for 201 created status', () => {
    const req = mockReq({ method: 'POST' });
    const res = mockRes(201);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 201 }),
      expect.stringContaining('201'),
    );
  });

  it('logs DELETE method correctly', () => {
    const req = mockReq({ method: 'DELETE', originalUrl: '/api/items/1' });
    const res = mockRes(204);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE' }),
      expect.stringContaining('DELETE /api/items/1 204'),
    );
  });

  it('logs PUT method correctly', () => {
    const req = mockReq({ method: 'PUT', originalUrl: '/api/users/1' });
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PUT' }),
      expect.stringContaining('PUT /api/users/1 200'),
    );
  });

  it('logs PATCH method correctly', () => {
    const req = mockReq({ method: 'PATCH', originalUrl: '/api/items/1' });
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'PATCH' }),
      expect.stringContaining('PATCH /api/items/1 200'),
    );
  });

  it('logs OPTIONS method correctly', () => {
    const req = mockReq({ method: 'OPTIONS', originalUrl: '/api/test' });
    const res = mockRes(204);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'OPTIONS', statusCode: 204 }),
      expect.stringContaining('OPTIONS /api/test 204'),
    );
  });

  it('logs warn for 403 forbidden status', () => {
    const req = mockReq();
    const res = mockRes(403);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
      expect.any(String),
    );
  });

  it('logs error for 503 service unavailable status', () => {
    const req = mockReq();
    const res = mockRes(503);

    httpLogger(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 503 }),
      expect.stringContaining('503'),
    );
  });

  it('logs warn for 401 unauthorized status', () => {
    const req = mockReq();
    const res = mockRes(401);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401 }),
      expect.any(String),
    );
  });

  it('logs info for 100 informational status', () => {
    const req = mockReq();
    const res = mockRes(100);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 100 }),
      expect.any(String),
    );
  });

  it('logs very long URL without truncation', () => {
    const longUrl = '/api/test?' + 'a='.repeat(200) + 'b';
    const req = mockReq({ originalUrl: longUrl });
    const res = mockRes(200);
    httpLogger(req, res, next);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ url: longUrl }),
      expect.any(String),
    );
  });

  it('logs error for 599 status code', () => {
    const req = mockReq();
    const res = mockRes(599);

    httpLogger(req, res, next);

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 599 }),
      expect.stringContaining('599'),
    );
  });

  it('logs info for status code 0', () => {
    const req = mockReq();
    const res = mockRes(0);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 0 }),
      expect.any(String),
    );
  });

  it('logs request with undefined ip and userAgent', () => {
    const req = mockReq({ ip: undefined });
    (req as Record<string, unknown>).get = vi.fn().mockReturnValue(undefined);
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ip: undefined }),
      expect.any(String),
    );
  });

  it('logs warn for 405 method not allowed status', () => {
    const req = mockReq({ method: 'DELETE', originalUrl: '/api/readonly' });
    const res = mockRes(405);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 405, method: 'DELETE' }),
      expect.stringContaining('DELETE /api/readonly 405'),
    );
  });

  it('logs HEAD method correctly', () => {
    const req = mockReq({ method: 'HEAD', originalUrl: '/api/health' });
    const res = mockRes(200);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'HEAD', statusCode: 200 }),
      expect.stringContaining('HEAD /api/health 200'),
    );
  });

  it('logs info for 206 partial content status', () => {
    const req = mockReq();
    const res = mockRes(206);

    httpLogger(req, res, next);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 206 }),
      expect.any(String),
    );
  });

  it('logs warn for 429 too many requests status', () => {
    const req = mockReq();
    const res = mockRes(429);

    httpLogger(req, res, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 429 }),
      expect.any(String),
    );
  });
});
