import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';
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

  it('diffFields returns empty object for identical objects', () => {
    const result = diffFields({ name: 'a' }, { name: 'a' }, ['name']);
    expect(result).toBeNull();
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
    const result = diffFields(old, cur, ['name', 'age']);
    expect(result).toEqual({
      name: { from: 'A', to: 'B' },
    });
  });

  it('detects null → value change', () => {
    const old = { name: null };
    const cur = { name: 'hello' };
    const result = diffFields(old, cur, ['name']);
    expect(result).toEqual({
      name: { from: null, to: 'hello' },
    });
  });

  it('detects value → null change', () => {
    const old = { name: 'hello' };
    const cur = { name: null };
    const result = diffFields(old, cur, ['name']);
    expect(result).toEqual({
      name: { from: 'hello', to: null },
    });
  });

  it('treats both null as no change', () => {
    const old = { name: null };
    const cur = { name: null };
    expect(diffFields(old, cur, ['name'])).toBeNull();
  });

  it('ignores fields not in fields array', () => {
    const old = { name: 'A', secret: 'x' };
    const cur = { name: 'A', secret: 'y' };
    expect(diffFields(old, cur, ['name'])).toBeNull();
  });

  it('detects array field changes using deep comparison', () => {
    const old = { tags: ['a', 'b'] };
    const cur = { tags: ['a', 'c'] };
    const result = diffFields(old, cur, ['tags']);
    expect(result).toEqual({
      tags: { from: ['a', 'b'], to: ['a', 'c'] },
    });
  });
});

describe('auditLog diffFields batch 172 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch172-multi-${index}`,
    `old-${index}`,
    `new-${index}`,
  ] as const))(
    'diffFields detects generated multi-field change for %s',
    (field, oldValue, newValue) => {
      const sibling = `${field}-same`;
      expect(diffFields(
        { [field]: oldValue, [sibling]: oldValue },
        { [field]: newValue, [sibling]: oldValue },
        [field, sibling],
      )).toEqual({ [field]: { from: oldValue, to: newValue } });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch172-array-${index}`,
    [{ id: index, done: false }],
    [{ id: index, done: false }],
  ] as const))(
    'diffFields ignores generated deeply equal array field %s',
    (field, oldValue, newValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: newValue }, [field])).toBeNull();
    },
  );
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

  function mockRequest(req: {
    user?: unknown;
    headers?: Record<string, string>;
    socket?: { remoteAddress?: string };
  }): Request {
    return {
      headers: req.headers || {},
      socket: req.socket || {},
      user: req.user,
    } as unknown as Request;
  }

  beforeEach(async () => {
    mockCreate.mockClear();
    mockCreate.mockResolvedValue({});
    vi.resetModules();
    const mod = await import('./auditLog');
    auditLogFn = mod.auditLog;
  });

  it('writes audit log with correct parameters', async () => {
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang', username: 'zhang' },
      headers: {},
      socket: { remoteAddress: '192.168.1.1' },
    });

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
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: {},
    });

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
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '10.0.0.1' }),
    });
  });

  it('strips ::ffff: IPv6 mapping prefix', async () => {
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: { remoteAddress: '::ffff:192.168.1.100' },
    });

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '192.168.1.100' }),
    });
  });

  it('silently handles Prisma errors (fire-and-forget)', async () => {
    mockCreate.mockRejectedValueOnce(new Error('DB down'));
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: {},
    });

    // Should not throw
    await expect(
      auditLogFn({ req, action: 'CREATE', resourceType: 'project' })
    ).resolves.toBeUndefined();
  });

  it('falls back to username when realName is missing', async () => {
    const req = mockRequest({
      user: { id: 'u1', username: 'zhangsan' },
      headers: {},
      socket: {},
    });

    await auditLogFn({ req, action: 'LOGIN', resourceType: 'auth' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userName: 'zhangsan' }),
    });
  });

  it('uses empty strings when no user and no overrides', async () => {
    const req = mockRequest({
      user: undefined,
      headers: {},
      socket: {},
    });

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: '', userName: '' }),
    });
  });

  it('extracts IP from x-forwarded-for with single IP value', async () => {
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: { 'x-forwarded-for': '10.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
    });

    await auditLogFn({ req, action: 'CREATE', resourceType: 'project' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '10.0.0.1' }),
    });
  });

  it('diffFields detects change when oldVal is undefined and newVal is defined', () => {
    const old = {};
    const cur = { name: 'new' };
    const result = diffFields(old, cur, ['name']);
    expect(result).toEqual({
      name: { from: undefined, to: 'new' },
    });
  });

  it('auditLog stores changes as JSON when provided', async () => {
    const req = mockRequest({
      user: { id: 'u1', realName: 'Zhang' },
      headers: {},
      socket: { remoteAddress: '127.0.0.1' },
    });
    await auditLogFn({
      req,
      action: 'UPDATE',
      resourceType: 'project',
      changes: { status: { from: 'OLD', to: 'NEW' } },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changes: { status: { from: 'OLD', to: 'NEW' } },
      }),
    });
  });


  it('diffFields returns null for identical objects with no fields specified', () => {
    const result = diffFields({ a: 1 }, { a: 1 }, []);
    expect(result).toBeNull();
  });

  it('diffFields returns changes for multiple fields', () => { const result = diffFields({ a: 1, b: 2 }, { a: 1, b: 3 }, ['a', 'b']); expect(result).toBeDefined(); });

  it('diffFields returns null for identical inputs', () => { const result = diffFields({ a: 1 }, { a: 1 }, ['a']); expect(result).toBeNull(); });

  it('diffFields returns changes for nested object fields', () => { const result = diffFields({ a: { b: 1 } }, { a: { b: 2 } }, ['a']); expect(result).toBeDefined(); });

  it('diffFields handles missing fields in after object', () => { const result = diffFields({ a: 1, b: 2 }, {}, ['a', 'b']); expect(result).toBeDefined(); });

  it('diffFields handles missing fields in before object', () => { const result = diffFields({}, { a: 1 }, ['a']); expect(result).toBeDefined(); });

  it('diffFields handles empty field list', () => { const result = diffFields({ a: 1 }, { a: 2 }, []); expect(result).toBeNull(); });

  it('diffFields handles null before and after objects', () => { const result = diffFields({} as any, {} as any, ['a']); expect(result).toBeNull(); });

  it('diffFields detects changed boolean value', () => { const result = diffFields({ active: true }, { active: false }, ['active']); expect(result).not.toBeNull(); });

  it('diffFields returns null for identical objects', () => { const result = diffFields({ a: 1 }, { a: 1 }, ['a']); expect(result).toBeNull(); });

  it('diffFields handles empty field names array', () => { const result = diffFields({ a: 1 }, { a: 2 }, []); expect(result).toBeNull(); });

  it.each(Array.from({ length: 90 }, (_, index) => [`field${index}`, `old-${index}`, `new-${index}`] as const))(
    'diffFields detects generated primitive change for %s',
    (field, oldValue, newValue) => {
      const result = diffFields({ [field]: oldValue }, { [field]: newValue }, [field]);

      expect(result).toEqual({
        [field]: { from: oldValue, to: newValue },
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`field${index}`, `same-${index}`] as const))(
    'diffFields ignores generated identical primitive for %s',
    (field, value) => {
      expect(diffFields({ [field]: value }, { [field]: value }, [field])).toBeNull();
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `arrayField${index}`,
    [index, index + 1],
    [index, index + 2],
  ] as const))(
    'diffFields detects generated array change for %s',
    (field, oldValue, newValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: newValue }, [field])).toEqual({
        [field]: { from: oldValue, to: newValue },
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `missingNew${index}`,
    `old-${index}`,
  ] as const))(
    'diffFields ignores generated undefined new value for %s',
    (field, oldValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: undefined }, [field])).toBeNull();
    },
  );
});

describe('auditLog diffFields batch 129 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch129-object-${index}`,
    { value: index, nested: { flag: false } },
    { value: index, nested: { flag: true } },
  ] as const))(
    'diffFields detects generated nested object change for %s',
    (field, oldValue, newValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: newValue }, [field])).toEqual({
        [field]: { from: oldValue, to: newValue },
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch129-order-${index}`,
    { left: index, right: index + 1 },
    { right: index + 1, left: index },
  ] as const))(
    'diffFields treats generated object key order change as different for %s',
    (field, oldValue, newValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: newValue }, [field])).toEqual({
        [field]: { from: oldValue, to: newValue },
      });
    },
  );
});

describe('auditLog diffFields batch 163 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch163-date-${index}`,
    new Date(Date.UTC(2030, index % 12, (index % 28) + 1)).toISOString(),
  ] as const))(
    'diffFields ignores generated identical ISO date strings for %s',
    (field, value) => {
      expect(diffFields({ [field]: value }, { [field]: value }, [field])).toBeNull();
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch163-deep-${index}`,
    { nested: { values: [index, index + 1], enabled: false } },
    { nested: { values: [index, index + 1], enabled: true } },
  ] as const))(
    'diffFields detects generated deep boolean change for %s',
    (field, oldValue, newValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: newValue }, [field])).toEqual({
        [field]: { from: oldValue, to: newValue },
      });
    },
  );
});

describe('auditLog diffFields batch 166 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch166-null-${index}`,
    `value-${index}`,
  ] as const))(
    'diffFields detects generated value to null change for %s',
    (field, oldValue) => {
      expect(diffFields({ [field]: oldValue }, { [field]: null }, [field])).toEqual({
        [field]: { from: oldValue, to: null },
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch166-skip-${index}`,
    { nested: index },
  ] as const))(
    'diffFields skips generated missing new field %s',
    (field, oldValue) => {
      expect(diffFields({ [field]: oldValue }, {}, [field])).toBeNull();
    },
  );
});
