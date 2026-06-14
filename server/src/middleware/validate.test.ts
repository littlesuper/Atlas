import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextFunction, Request, Response } from 'express';
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
  let next: NextFunction & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
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

    const req = mockReq({ query: { page: '2', limit: '10' } as Request['query'] });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 2, limit: 10 });
  });

  // ─── 4. Invalid query params returns 400 ─────────────────
  it('returns 400 when query params are invalid', () => {
    const schema = z.object({ page: z.coerce.number().min(1) });
    const middleware = validate({ query: schema });

    const req = mockReq({ query: { page: '0' } as Request['query'] });
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
    const req = mockReq({ params: { id } });
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
      query: { verbose: 'true' } as Request['query'],
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
      query: { page: '0' } as Request['query'],
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
      query: originalQuery as Request['query'],
      params: originalParams,
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

  it('allows empty body when body schema accepts partial', () => {
    const schema = z.object({ name: z.string().optional() });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: {} });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({});
  });

  it('validates body, query, and params together when all schemas provided', () => {
    const bodySchema = z.object({ name: z.string() });
    const querySchema = z.object({ page: z.coerce.number() });
    const paramsSchema = z.object({ id: z.string() });
    const middleware = validate({ body: bodySchema, query: querySchema, params: paramsSchema });

    const req = mockReq({
      body: { name: 'test' },
      query: { page: '1' } as Request['query'],
      params: { id: 'abc' },
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'test' });
    expect(req.query).toEqual({ page: 1 });
    expect(req.params).toEqual({ id: 'abc' });
  });

  it('calls next() when no schemas are provided', () => {
    const middleware = validate({});
    const req = mockReq();
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('shows message without path prefix for root-level validation error', () => {
    const schema = z.string().min(5);
    const middleware = validate({ body: schema });

    const req = mockReq({ body: 'hi' });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.details.length).toBeGreaterThan(0);
    expect(jsonCall.details[0]).not.toMatch(/^\w+: /);
  });

  it('returns 400 when path params fail validation', () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });

    const req = mockReq({ params: { id: 'not-a-uuid' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: '请求参数校验失败',
        details: expect.arrayContaining([expect.stringContaining('id')]),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('does not touch body and query when only params schema is provided', () => {
    const paramsSchema = z.object({ id: z.string() });
    const middleware = validate({ params: paramsSchema });

    const originalBody = { name: 'test' };
    const originalQuery = { page: '1' };
    const req = mockReq({
      body: originalBody,
      query: originalQuery as Request['query'],
      params: { id: 'abc' },
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBe(originalBody);
    expect(req.query).toBe(originalQuery);
    expect(req.params).toEqual({ id: 'abc' });
  });

  it('returns multiple error messages for multiple invalid fields', () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { email: 'not-email', age: 10 } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.details.length).toBeGreaterThanOrEqual(2);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns Chinese error message header for Zod validation failure', () => {
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: '' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: '请求参数校验失败' }),
    );
  });

  it('applies schema defaults during validation', () => {
    const schema = z.object({ role: z.string().default('viewer') });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: {} });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ role: 'viewer' });
  });

  it('validates query with coerce transform', () => {
    const schema = z.object({ ids: z.string().transform((v) => v.split(',')) });
    const middleware = validate({ query: schema });

    const req = mockReq({ query: { ids: 'a,b,c' } as unknown as Request['query'] });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ ids: ['a', 'b', 'c'] });
  });

  it('validates only query when body and params schemas are omitted', () => {
    const querySchema = z.object({ search: z.string() });
    const middleware = validate({ query: querySchema });

    const originalBody = { should: 'remain' };
    const req = mockReq({
      body: originalBody,
      query: { search: 'test' } as Request['query'],
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toBe(originalBody);
    expect(req.query).toEqual({ search: 'test' });
  });

  it('validates body schema with refine that accesses multiple fields', () => {
    const schema = z.object({
      password: z.string(),
      confirmPassword: z.string(),
    }).refine(data => data.password === data.confirmPassword, {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { password: 'abc', confirmPassword: 'xyz' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.details.some((d: string) => d.includes('confirmPassword'))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('strips extra fields when schema uses strict mode', () => {
    const schema = z.object({ name: z.string() }).strict();
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: 'Alice', extra: 'removed' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('validates nullable field accepting null value', () => {
    const schema = z.object({ notes: z.string().nullable() });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { notes: null } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ notes: null });
  });

  it('validates body with union type schema', () => {
    const schema = z.object({ value: z.union([z.string(), z.number()]) });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { value: 42 } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ value: 42 });
  });

  it('validates body with array schema accepting empty array', () => {
    const schema = z.object({ items: z.array(z.string()) });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { items: [] } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ items: [] });
  });

  it('preserves extra fields with passthrough schema', () => {
    const schema = z.object({ name: z.string() }).passthrough();
    const middleware = validate({ body: schema });
    const req = mockReq({ body: { name: 'Alice', extra: 'kept' } });
    const res = mockRes();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice', extra: 'kept' });
  });

  it('validates body with date schema', () => {
    const schema = z.object({ date: z.coerce.date() });
    const middleware = validate({ body: schema });
    const req = mockReq({ body: { date: '2024-01-15' } });
    const res = mockRes();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.body.date).toBeInstanceOf(Date);
  });

  it('preserves transformed body even when query validation fails', () => {
    const bodySchema = z.object({ name: z.string().trim() });
    const querySchema = z.object({ page: z.coerce.number().min(1) });
    const middleware = validate({ body: bodySchema, query: querySchema });

    const req = mockReq({
      body: { name: '  Alice  ' },
      query: { page: '0' } as Request['query'],
    });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(req.body).toEqual({ name: 'Alice' });
  });

  it('passes non-ZodError to next error handler', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });

    const req = mockReq({ body: { name: 'test' } });
    const res = mockRes();

    const _originalParse = schema.parse;
    vi.spyOn(schema, 'parse').mockImplementation(() => { throw new Error('unexpected'); });

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    vi.restoreAllMocks();
  });

  it('validates body with record schema accepting arbitrary keys', () => {
    const schema = z.record(z.string(), z.number());
    const middleware = validate({ body: schema });
    const req = mockReq({ body: { a: 1, b: 2 } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ a: 1, b: 2 });
  });

  it('validates body with enum schema rejecting invalid value', () => {
    const schema = z.object({ status: z.enum(['active', 'inactive']) });
    const middleware = validate({ body: schema });
    const req = mockReq({ body: { status: 'pending' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const jsonCall = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(jsonCall.details.some((d: string) => d.includes('status'))).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });

  it('validates params schema and replaces req.params', () => {
    const schema = z.object({ id: z.string().min(1) });
    const middleware = validate({ params: schema });
    const req = mockReq({ params: { id: 'abc' } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: 'abc' });
  });

  it('validates body with deeply nested object schema', () => {
    const schema = z.object({
      level1: z.object({
        level2: z.object({
          value: z.number(),
        }),
      }),
    });
    const middleware = validate({ body: schema });
    const req = mockReq({ body: { level1: { level2: { value: 42 } } } });
    const res = mockRes();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ level1: { level2: { value: 42 } } });
  });
});
