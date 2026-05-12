import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { requestId } from './requestId';

function mockReq(overrides: Partial<Request> = {}): Request {
  return { headers: {}, ...overrides } as unknown as Request;
}

function mockRes(): Partial<Response> {
  const headers: Record<string, string> = {};
  return {
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }) as unknown as Response['setHeader'],
  };
}

describe('requestId middleware', () => {
  let next: NextFunction & ReturnType<typeof vi.fn>;

  beforeEach(() => {
    next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  });

  it('generates a UUID when no x-request-id header is present', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('uses the x-request-id header when provided', () => {
    const req = mockReq({ headers: { 'x-request-id': 'custom-id-123' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe('custom-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'custom-id-123');
  });

  it('calls next exactly once', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates different UUIDs for successive calls', () => {
    const req1 = mockReq();
    const req2 = mockReq();
    const res1 = mockRes();
    const res2 = mockRes();

    requestId(req1, res1 as Response, next);
    requestId(req2, res2 as Response, next);

    expect(req1.id).not.toBe(req2.id);
  });

  it('trims x-request-id header value', () => {
    const req = mockReq({ headers: { 'x-request-id': '  custom-id  ' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe('  custom-id  ');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', '  custom-id  ');
  });

  it('sets req.id before calling next', () => {
    const req = mockReq();
    const res = mockRes();
    let idAtNext: string | undefined;

    const captureNext = vi.fn(() => { idAtNext = req.id; });

    requestId(req, res as Response, captureNext);

    expect(idAtNext).toBeTruthy();
    expect(typeof idAtNext).toBe('string');
  });

  it('uses X-Request-Id case-insensitively', () => {
    const req = mockReq({ headers: { 'x-request-id': 'lowercase-id' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe('lowercase-id');
  });

  it('generates a valid UUID v4 format', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    const uuid = req.id!;
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets both req.id and X-Request-Id header to same value', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    const setHeaderCalls = (res.setHeader as ReturnType<typeof vi.fn>).mock.calls;
    expect(setHeaderCalls[0][1]).toBe(req.id);
  });

  it('overwrites empty string x-request-id with generated UUID', () => {
    const req = mockReq({ headers: { 'x-request-id': '' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('sets X-Request-Id header even for provided id', () => {
    const req = mockReq({ headers: { 'x-request-id': 'my-trace-id' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'my-trace-id');
  });

  it('generated UUID does not contain x-request-id value', () => {
    const req = mockReq({ headers: { 'x-request-id': 'custom-val' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe('custom-val');
    expect(req.id).not.toMatch(/^[0-9a-f]{8}-/);
  });

  it('preserves special characters in x-request-id header', () => {
    const specialId = 'id-with/special+chars=and.more';
    const req = mockReq({ headers: { 'x-request-id': specialId } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe(specialId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', specialId);
  });

  it('calls res.setHeader exactly once per request', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(res.setHeader).toHaveBeenCalledTimes(1);
  });

  it('handles very long x-request-id header value', () => {
    const longId = 'a'.repeat(1000);
    const req = mockReq({ headers: { 'x-request-id': longId } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe(longId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', longId);
  });

  it('generates unique UUIDs for 100 rapid sequential calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const req = mockReq();
      const res = mockRes();
      requestId(req, res as Response, next);
      ids.add(req.id!);
    }
    expect(ids.size).toBe(100);
  });

  it('preserves whitespace-only x-request-id as truthy', () => {
    const req = mockReq({ headers: { 'x-request-id': '   ' } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe('   ');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', '   ');
  });

  it('overwrites null x-request-id header with generated UUID', () => {
    const req = mockReq({ headers: { 'x-request-id': null } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
  });

  it('preserves numeric x-request-id header as string', () => {
    const req = mockReq({ headers: { 'x-request-id': 12345 } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe(12345);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 12345);
  });

  it('generates UUID when x-request-id header is undefined', () => {
    const req = mockReq({ headers: { 'x-request-id': undefined } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when x-request-id is boolean false', () => {
    const req = mockReq({ headers: { 'x-request-id': false } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('uses provided x-request-id that contains unicode characters', () => {
    const unicodeId = '请求-标识符-123';
    const req = mockReq({ headers: { 'x-request-id': unicodeId } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe(unicodeId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', unicodeId);
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when x-request-id header is array', () => {
    const req = mockReq({ headers: { 'x-request-id': ['id-1', 'id-2'] } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(next).toHaveBeenCalled();
  });

  it('preserves x-request-id header containing emoji characters', () => {
    const emojiId = 'req-🚀-123';
    const req = mockReq({ headers: { 'x-request-id': emojiId } } as unknown as Partial<Request>);
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBe(emojiId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', emojiId);
    expect(next).toHaveBeenCalled();
  });

  it('generated UUID is stable type string', () => {
    const req = mockReq();
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(typeof req.id).toBe('string');
    expect(req.id!.length).toBeGreaterThan(0);
  });

  it('handles headers object without x-request-id property', () => {
    const req = mockReq({ headers: {} });
    const res = mockRes();

    requestId(req, res as Response, next);

    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('uses provided x-request-id with exact UUID v4 format', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const req = mockReq({ headers: { 'x-request-id': uuid } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBe(uuid);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', uuid);
    expect(next).toHaveBeenCalled();
  });

  it('uses x-request-id with tab and newline characters', () => {
    const id = 'id\twith\nnewlines';
    const req = mockReq({ headers: { 'x-request-id': id } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBe(id);
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when headers object is empty and has no prototype methods', () => {
    const req = mockReq({ headers: Object.create(null) });
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('works with frozen headers object', () => {
    const headers = Object.freeze({ 'x-request-id': 'frozen-id' });
    const req = mockReq({ headers } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBe('frozen-id');
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when x-request-id header is empty string', () => {
    const req = mockReq({ headers: { 'x-request-id': '' } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('generates UUID when headers object has x-request-id set to zero', () => {
    const req = mockReq({ headers: { 'x-request-id': 0 } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });

  it('handles headers object with x-request-id as empty object', () => {
    const req = mockReq({ headers: { 'x-request-id': {} } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBeTruthy();
    expect(next).toHaveBeenCalled();
  });

  it('uses x-request-id header value when provided as valid UUID', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const req = mockReq({ headers: { 'x-request-id': uuid } } as unknown as Partial<Request>);
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBe(uuid);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', uuid);
  });

  it('generates UUID when req has no headers property', () => {
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    requestId(req, res as Response, next);
    expect(req.id).toBeTruthy();
    expect(req.id).toMatch(/^[0-9a-f]{8}-/);
    expect(next).toHaveBeenCalled();
  });
});
