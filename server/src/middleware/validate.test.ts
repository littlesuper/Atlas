import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { z } from 'zod';
import { validate } from './validate';

// ─── Helpers ───────────────────────────────────────────────
function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

describe('validate middleware', () => {
  let next: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn();
  });

  // ─── 1. Valid body passes through and calls next() ───────
  it('calls next() when body is valid', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: 'Alice', age: 30 } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice', age: 30 });
    expect(res.status).not.toHaveBeenCalled();
  });

  // ─── 2. Invalid body returns 400 with error details ──────
  it('returns 400 with details when body is invalid', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: 123, age: 'not-a-number' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: '请求参数校验失败',
        details: expect.arrayContaining([
          expect.stringContaining('name'),
          expect.stringContaining('age'),
        ]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ─── 3. Valid query params parsed correctly ──────────────
  it('parses valid query params and replaces req.query', () => {
    const schema = z.object({ page: z.coerce.number(), limit: z.coerce.number() });
    const middleware = validate({ query: schema });

    const req = mockReq({ query: { page: '2', limit: '10' } as any });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 2, limit: 10 });
  });

  // ─── 4. Invalid query params returns 400 ─────────────────
  it('returns 400 when query params are invalid', () => {
    const schema = z.object({ page: z.coerce.number().min(1) });
    const middleware = validate({ query: schema });

    const req = mockReq({ query: { page: '0' } as any });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: '请求参数校验失败',
        details: expect.any(Array),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  // ─── 5. Valid path params parsed correctly ────────────────
  it('parses valid path params and replaces req.params', () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });

    const id = '550e8400-e29b-41d4-a716-446655440000';
    const req = mockReq({ params: { id } as any });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id });
  });

  // ─── 6. Body schema transforms values (e.g. trim) ────────
  it('replaces req.body with transformed (trimmed) values', () => {
    const schema = z.object({
      name: z.string().trim(),
      email: z.string().trim().toLowerCase(),
    });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: '  Alice  ', email: '  ALICE@EXAMPLE.COM  ' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });

  // ─── 7. Multiple validation targets (body + query) ───────
  it('validates both body and query when both schemas provided', () => {
    const bodySchema = z.object({ title: z.string() });
    const querySchema = z.object({ verbose: z.coerce.boolean() });
    const middleware = validate({ body: bodySchema, query: querySchema });

    const req = mockReq({
      body: { title: 'Test' },
      query: { verbose: 'true' } as any,
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ title: 'Test' });
    expect(req.query).toEqual({ verbose: true });
  });

  it('returns 400 when body is valid but query is invalid', () => {
    const bodySchema = z.object({ title: z.string() });
    const querySchema = z.object({ page: z.coerce.number().min(1) });
    const middleware = validate({ body: bodySchema, query: querySchema });

    const req = mockReq({
      body: { title: 'OK' },
      query: { page: '0' } as any,
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  // ─── 8. Missing required field shows field path in details ─
  it('includes field path in error details for missing required fields', () => {
    const schema = z.object({
      user: z.object({
        name: z.string(),
        address: z.object({
          city: z.string(),
        }),
      }),
    });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { user: { name: 'Alice', address: {} } } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // The path "user.address.city" should appear in at least one detail message
    expect(jsonCall.details.some((d: string) => d.includes('user.address.city'))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  // ─── 9. Only body schema provided, query/params untouched ─
  it('does not touch query and params when only body schema is provided', () => {
    const bodySchema = z.object({ name: z.string() });
    const middleware = validate({ body: bodySchema });

    const originalQuery = { foo: 'bar' };
    const originalParams = { id: '123' };
    const req = mockReq({
      body: { name: 'Alice' },
      query: originalQuery as any,
      params: originalParams as any,
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    // query and params should remain the exact same object references
    expect(req.query).toBe(originalQuery);
    expect(req.params).toBe(originalParams);
  });

  // ─── 10. Non-ZodError passes to next(error) ──────────────
  it('passes non-ZodError to next(error)', () => {
    // Create a schema whose parse will throw a non-Zod error
    const badSchema = {
      parse: () => {
        throw new TypeError('Something unexpected happened');
      },
    } as unknown as z.ZodType;
    const middleware = validate({ body: badSchema });

    const req = mockReq({ body: { anything: true } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
    expect((next.mock.calls[0][0] as Error).message).toBe('Something unexpected happened');
    expect(res.status).not.toHaveBeenCalled();
  });
});
