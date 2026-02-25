import { describe, it, expect, vi, beforeEach } from 'vitest';
import { diffFields } from './auditLog';

// We test diffFields directly (pure function).
// auditLog() depends on Prisma — tested separately with mocks.

describe('diffFields', () => {
  it('returns null when no fields changed', () => {
    const old = { name: 'A', status: 1 };
    const cur = { name: 'A', status: 1 };
    expect(diffFields(old, cur, ['name', 'status'])).toBeNull();
  });

  it('returns null for empty fields array', () => {
    const old = { name: 'A' };
    const cur = { name: 'B' };
    expect(diffFields(old, cur, [])).toBeNull();
  });

  it('detects single field change', () => {
    const old = { name: 'A' };
    const cur = { name: 'B' };
    expect(diffFields(old, cur, ['name'])).toEqual({
      name: { from: 'A', to: 'B' },
    });
  });

  it('detects multiple field changes', () => {
    const old = { name: 'A', status: 0 };
    const cur = { name: 'B', status: 1 };
    const result = diffFields(old, cur, ['name', 'status']);
    expect(result).toEqual({
      name: { from: 'A', to: 'B' },
      status: { from: 0, to: 1 },
    });
  });

  it('handles object fields using deep comparison', () => {
    const old = { meta: { a: 1, b: 2 } };
    const cur = { meta: { a: 1, b: 3 } };
    const result = diffFields(old, cur, ['meta']);
    expect(result).toEqual({
      meta: { from: { a: 1, b: 2 }, to: { a: 1, b: 3 } },
    });
  });

  it('returns null when object fields are deeply equal', () => {
    const old = { meta: { a: 1 } };
    const cur = { meta: { a: 1 } };
    expect(diffFields(old, cur, ['meta'])).toBeNull();
  });

  it('skips fields where newVal is undefined', () => {
    const old = { name: 'A', age: 10 };
    const cur = { name: 'B' }; // age is undefined in newObj
    const result = diffFields(old, cur as any, ['name', 'age']);
    expect(result).toEqual({
      name: { from: 'A', to: 'B' },
    });
  });

  it('detects null → value change', () => {
    const old = { name: null };
    const cur = { name: 'hello' };
    const result = diffFields(old as any, cur, ['name']);
    expect(result).toEqual({
      name: { from: null, to: 'hello' },
    });
  });

  it('detects value → null change', () => {
    const old = { name: 'hello' };
    const cur = { name: null };
    const result = diffFields(old, cur as any, ['name']);
    expect(result).toEqual({
      name: { from: 'hello', to: null },
    });
  });

  it('treats both null as no change', () => {
    const old = { name: null };
    const cur = { name: null };
    expect(diffFields(old as any, cur as any, ['name'])).toBeNull();
  });

  it('ignores fields not in fields array', () => {
    const old = { name: 'A', secret: 'x' };
    const cur = { name: 'A', secret: 'y' };
    expect(diffFields(old, cur, ['name'])).toBeNull();
  });
});

// ─── auditLog function tests with Prisma mock ──────────────
const { mockCreate } = vi.hoisted(() => {
  const mockCreate = vi.fn().mockResolvedValue({});
  return { mockCreate };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    auditLog = { create: mockCreate };
  },
}));

describe('auditLog', () => {
  let auditLogFn: typeof import('./auditLog').auditLog;

  beforeEach(async () => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({});
    vi.resetModules();
    const mod = await import('./auditLog');
    auditLogFn = mod.auditLog;
  });

  it('writes audit log with correct parameters', async () => {
    const req = {
      user: { id: 'u1', realName: 'Zhang', username: 'zhang' },
      headers: {},
      socket: { remoteAddress: '192.168.1.1' },
    } as any;

    await auditLogFn({
      req,
      action: 'CREATE',
      resourceType: 'project',
      resourceId: 'p1',
      resourceName: 'Test Project',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        userName: 'Zhang',
        action: 'CREATE',
        resourceType: 'project',
        resourceId: 'p1',
        resourceName: 'Test Project',
        ipAddress: '192.168.1.1',
      }),
    });
  });

  it('uses userId/userName override when provided', async () => {
    const req = {
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: {},
    } as any;

    await auditLogFn({
      req,
      action: 'LOGIN',
      resourceType: 'auth',
      userId: 'override-id',
      userName: 'Override Name',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'override-id',
        userName: 'Override Name',
      }),
    });
  });

  it('extracts IP from x-forwarded-for header', async () => {
    const req = {
      user: { id: 'u1', realName: 'Zhang' },
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      socket: { remoteAddress: '127.0.0.1' },
    } as any;

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '10.0.0.1' }),
    });
  });

  it('strips ::ffff: IPv6 mapping prefix', async () => {
    const req = {
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: { remoteAddress: '::ffff:192.168.1.100' },
    } as any;

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '192.168.1.100' }),
    });
  });

  it('silently handles Prisma errors (fire-and-forget)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'));
    const req = {
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: {},
    } as any;

    // Should not throw
    await expect(
      auditLogFn({ req, action: 'CREATE', resourceType: 'project' })
    ).resolves.toBeUndefined();
  });
});
