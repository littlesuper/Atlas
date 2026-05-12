import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { apiCache, invalidateCache } from './cache';

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/test',
    user: null,
    ...overrides,
  } as unknown as Request;
}

function mockRes(statusCode = 200): Response {
  const jsonFn = vi.fn().mockReturnThis();
  const res: Partial<Response> = {
    statusCode,
    json: jsonFn,
  };
  return res as Response;
}

describe('apiCache middleware', () => {
  let next: NextFunction & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
    invalidateCache();
  });

  it('skips caching for non-GET requests', () => {
    const req = mockReq({ method: 'POST' });
    const res = mockRes();

    apiCache(60)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('serves cached response on second request', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ data: 'cached' });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith({ data: 'cached' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not cache non-2xx responses', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes(500);

    middleware(req, res1, next);
    res1.json({ error: 'fail' });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('expires cached entries after TTL', () => {
    vi.useFakeTimers();
    const middleware = apiCache(1);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ data: 'old' });

    vi.advanceTimersByTime(2000);

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('invalidates cache by pattern', () => {
    const middleware = apiCache(60);
    const req1 = mockReq({ originalUrl: '/api/users' });
    const res1 = mockRes();

    middleware(req1, res1, next);
    res1.json({ users: [] });

    invalidateCache('users');

    const res2 = mockRes();
    middleware(req1, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('invalidates all cache when no pattern', () => {
    const middleware = apiCache(60);
    const req1 = mockReq({ originalUrl: '/api/a' });
    const res1 = mockRes();

    middleware(req1, res1, next);
    res1.json({ a: 1 });

    invalidateCache();

    const res2 = mockRes();
    middleware(req1, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('caches per user separately', () => {
    const middleware = apiCache(60);
    const req1 = mockReq({ user: { id: 'user-1' } } as unknown as Partial<Request>);
    const res1 = mockRes();

    middleware(req1, res1, next);
    res1.json({ data: 'for-user-1' });

    const req2 = mockReq({ user: { id: 'user-2' } } as unknown as Partial<Request>);
    const res2 = mockRes();
    middleware(req2, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('skips caching for PUT requests', () => {
    const req = mockReq({ method: 'PUT' });
    const res = mockRes();

    apiCache(60)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('skips caching for DELETE requests', () => {
    const req = mockReq({ method: 'DELETE' });
    const res = mockRes();

    apiCache(60)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('does not cache 201 responses', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes(301);

    middleware(req, res1, next);
    res1.json({ redirected: true });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('uses anon key when user is null', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ public: true });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith({ public: true });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('pattern invalidation only removes matching keys', () => {
    const middleware = apiCache(60);

    const reqA = mockReq({ originalUrl: '/api/users' });
    const resA = mockRes();
    middleware(reqA, resA, next);
    resA.json({ users: [] });

    const reqB = mockReq({ originalUrl: '/api/projects' });
    const resB = mockRes();
    middleware(reqB, resB, next);
    resB.json({ projects: [] });

    invalidateCache('users');

    const resA2 = mockRes();
    middleware(reqA, resA2, next);
    expect(next).toHaveBeenCalledTimes(3);

    const resB2 = mockRes();
    middleware(reqB, resB2, next);
    expect(resB2.json).toHaveBeenCalledWith({ projects: [] });
  });

  it('caches 299 status responses', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes(299);

    middleware(req, res1, next);
    res1.json({ data: 'edge' });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith({ data: 'edge' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('skips caching for PATCH requests', () => {
    const req = mockReq({ method: 'PATCH' });
    const res = mockRes();

    apiCache(60)(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('non-matching pattern invalidation preserves existing cache', () => {
    const middleware = apiCache(60);
    const req = mockReq({ originalUrl: '/api/users' });
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ users: [] });

    invalidateCache('nonexistent-pattern');

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith({ users: [] });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('cache with TTL 0 never serves cached response', () => {
    vi.useFakeTimers();
    const middleware = apiCache(0);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ data: 'instant' });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('caches different query strings as separate entries', () => {
    const middleware = apiCache(60);

    const req1 = mockReq({ originalUrl: '/api/users?page=1' });
    const res1 = mockRes();
    middleware(req1, res1, next);
    res1.json({ page: 1 });

    const req2 = mockReq({ originalUrl: '/api/users?page=2' });
    const res2 = mockRes();
    middleware(req2, res2, next);
    res2.json({ page: 2 });

    const res1b = mockRes();
    middleware(req1, res1b, next);
    expect(res1b.json).toHaveBeenCalledWith({ page: 1 });

    const res2b = mockRes();
    middleware(req2, res2b, next);
    expect(res2b.json).toHaveBeenCalledWith({ page: 2 });

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('replaces cache when same URL is requested with different user', () => {
    const middleware = apiCache(60);

    const reqUser1 = mockReq({ user: { id: 'user-1' } } as unknown as Partial<Request>);
    const res1 = mockRes();
    middleware(reqUser1, res1, next);
    res1.json({ data: 'for-user-1' });

    const reqUser2 = mockReq({ user: { id: 'user-2' } } as unknown as Partial<Request>);
    const res2 = mockRes();
    middleware(reqUser2, res2, next);
    res2.json({ data: 'for-user-2' });

    const reqUser1Again = mockReq({ user: { id: 'user-1' } } as unknown as Partial<Request>);
    const res1b = mockRes();
    middleware(reqUser1Again, res1b, next);

    expect(res1b.json).toHaveBeenCalledWith({ data: 'for-user-1' });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('updates cached entry when same key gets a new response', () => {
    const middleware = apiCache(60);
    const req = mockReq();

    const res1 = mockRes();
    middleware(req, res1, next);
    res1.json({ version: 1 });

    const res2 = mockRes();
    middleware(req, res2, next);
    expect(res2.json).toHaveBeenCalledWith({ version: 1 });

    invalidateCache();
    const res3 = mockRes();
    middleware(req, res3, next);
    res3.json({ version: 2 });

    const res4 = mockRes();
    middleware(req, res4, next);
    expect(res4.json).toHaveBeenCalledWith({ version: 2 });
  });

  it('does not cache 200 response when overridden to 400 before json', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const jsonFn = vi.fn().mockReturnThis();
    const res: Partial<Response> = {
      statusCode: 200,
      json: jsonFn,
    };

    middleware(req, res as Response, next);

    (res as Record<string, unknown>).statusCode = 400;
    res.json!({ error: 'bad' });

    const res2 = mockRes();
    middleware(req, res2 as Response, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not cache 300 redirect response', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes(300);

    middleware(req, res1, next);
    res1.json({ redirect: true });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('uses different cache keys for URLs differing only by trailing slash', () => {
    const middleware = apiCache(60);
    const req1 = mockReq({ originalUrl: '/api/users' });
    const res1 = mockRes();
    middleware(req1, res1, next);
    res1.json({ data: 'no-slash' });

    const req2 = mockReq({ originalUrl: '/api/users/' });
    const res2 = mockRes();
    middleware(req2, res2, next);
    res2.json({ data: 'with-slash' });

    const res1b = mockRes();
    middleware(req1, res1b, next);
    expect(res1b.json).toHaveBeenCalledWith({ data: 'no-slash' });

    const res2b = mockRes();
    middleware(req2, res2b, next);
    expect(res2b.json).toHaveBeenCalledWith({ data: 'with-slash' });
  });

  it('caches same URL for logged-in user and anon separately', () => {
    const middleware = apiCache(60);

    const reqAnon = mockReq({ user: null });
    const resAnon = mockRes();
    middleware(reqAnon, resAnon, next);
    resAnon.json({ data: 'public' });

    const reqAuth = mockReq({ user: { id: 'user-1' } } as unknown as Partial<Request>);
    const resAuth = mockRes();
    middleware(reqAuth, resAuth, next);
    resAuth.json({ data: 'private' });

    const resAnon2 = mockRes();
    middleware(reqAnon, resAnon2, next);
    expect(resAnon2.json).toHaveBeenCalledWith({ data: 'public' });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('caches null response data', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json(null);

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith(null);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not cache 100 continue response', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes(100);

    middleware(req, res1, next);
    res1.json({ continue: true });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('serves updated cache after invalidation and re-population', () => {
    const middleware = apiCache(60);
    const req = mockReq({ originalUrl: '/api/data' });
    const res1 = mockRes();
    middleware(req, res1, next);
    res1.json({ version: 1 });

    invalidateCache('data');
    const res2 = mockRes();
    middleware(req, res2, next);
    res2.json({ version: 2 });

    const res3 = mockRes();
    middleware(req, res3, next);
    expect(res3.json).toHaveBeenCalledWith({ version: 2 });
  });

  it('cache with very large TTL serves cached response', () => {
    const middleware = apiCache(86400 * 365);
    const req = mockReq();
    const res1 = mockRes();
    middleware(req, res1, next);
    res1.json({ data: 'year-long' });
    const res2 = mockRes();
    middleware(req, res2, next);
    expect(res2.json).toHaveBeenCalledWith({ data: 'year-long' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not cache 200 response after invalidation with partial URL match', () => {
    const middleware = apiCache(60);
    const req = mockReq({ originalUrl: '/api/users/123' });
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ user: 'cached' });

    invalidateCache('users');

    const res2 = mockRes();
    middleware(req, res2, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('cache with negative TTL never serves cached response', () => {
    vi.useFakeTimers();
    const middleware = apiCache(-1);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ data: 'instant' });

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('skips caching for POST requests', () => {
    const req = mockReq({ method: 'POST' });
    const res = mockRes();
    apiCache(60)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('does not serve stale cache after TTL boundary with fractional seconds', () => {
    vi.useFakeTimers();
    const middleware = apiCache(0.5);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({ data: 'half-second' });

    vi.advanceTimersByTime(499);
    const res2 = mockRes();
    middleware(req, res2, next);
    expect(res2.json).toHaveBeenCalledWith({ data: 'half-second' });

    vi.advanceTimersByTime(2);
    const res3 = mockRes();
    middleware(req, res3, next);
    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('skips caching for HEAD requests', () => {
    const req = mockReq({ method: 'HEAD' });
    const res = mockRes();
    apiCache(60)(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('caches response with empty object body', () => {
    const middleware = apiCache(60);
    const req = mockReq();
    const res1 = mockRes();

    middleware(req, res1, next);
    res1.json({});

    const res2 = mockRes();
    middleware(req, res2, next);

    expect(res2.json).toHaveBeenCalledWith({});
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not cache OPTIONS requests', () => {
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();

    apiCache(60)(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
