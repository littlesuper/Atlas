import { describe, it, expect, vi } from 'vitest';
import {
  requirePermission,
  isAdmin,
  canManageProject,
  canDeleteProject,
  sanitizePagination,
} from './permission';
import { Request, Response } from 'express';

// Helper: build a minimal mock request
function mockReq(overrides: Partial<Express.Request['user']> = {}): Request {
  return {
    user: {
      id: 'u1',
      username: 'test',
      realName: 'Test',
      roles: [],
      permissions: [],
      collaboratingProjectIds: [],
      ...overrides,
    },
  } as unknown as Request;
}

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

// ─── requirePermission ──────────────────────────────────────
describe('requirePermission', () => {
  it('returns 401 when req.user is missing', () => {
    const req = { user: undefined } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'read')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows exact permission match', () => {
    const req = mockReq({ permissions: ['project:read'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'read')(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('allows wildcard *:*', () => {
    const req = mockReq({ permissions: ['*:*'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'delete')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows resource wildcard resource:*', () => {
    const req = mockReq({ permissions: ['project:*'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'delete')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows action wildcard *:action', () => {
    const req = mockReq({ permissions: ['*:read'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'read')(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 403 when no matching permission', () => {
    const req = mockReq({ permissions: ['user:read'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'delete')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when permissions array is empty', () => {
    const req = mockReq({ permissions: [] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'read')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('resource:* does not match different resource', () => {
    const req = mockReq({ permissions: ['user:*'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'read')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('*:action does not match different action', () => {
    const req = mockReq({ permissions: ['*:read'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'delete')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('checks multiple permissions and passes if any match', () => {
    const req = mockReq({ permissions: ['user:read', 'project:create'] });
    const res = mockRes();
    const next = vi.fn();

    requirePermission('project', 'create')(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

// ─── isAdmin ────────────────────────────────────────────────
describe('isAdmin', () => {
  it('returns true when user has *:*', () => {
    const req = mockReq({ permissions: ['*:*'] });
    expect(isAdmin(req)).toBe(true);
  });

  it('returns false when user lacks *:*', () => {
    const req = mockReq({ permissions: ['project:read'] });
    expect(isAdmin(req)).toBe(false);
  });

  it('returns false when req.user is undefined', () => {
    const req = { user: undefined } as unknown as Request;
    expect(isAdmin(req)).toBe(false);
  });
});

// ─── canManageProject ───────────────────────────────────────
describe('canManageProject', () => {
  it('returns true for admin (*:*)', () => {
    const req = mockReq({ permissions: ['*:*'] });
    expect(canManageProject(req, 'other-mgr', 'p1')).toBe(true);
  });

  it('returns true for project manager', () => {
    const req = mockReq({ id: 'mgr1', permissions: [] });
    expect(canManageProject(req, 'mgr1', 'p1')).toBe(true);
  });

  it('returns true for collaborator', () => {
    const req = mockReq({ id: 'u1', permissions: [], collaboratingProjectIds: ['p1', 'p2'] });
    expect(canManageProject(req, 'other-mgr', 'p1')).toBe(true);
  });

  it('returns false for non-collaborating non-admin non-manager', () => {
    const req = mockReq({ id: 'u1', permissions: [], collaboratingProjectIds: [] });
    expect(canManageProject(req, 'other-mgr', 'p1')).toBe(false);
  });
});

// ─── canDeleteProject ───────────────────────────────────────
describe('canDeleteProject', () => {
  it('returns true for admin', () => {
    const req = mockReq({ permissions: ['*:*'] });
    expect(canDeleteProject(req, 'other-mgr')).toBe(true);
  });

  it('returns true for project manager', () => {
    const req = mockReq({ id: 'mgr1', permissions: [] });
    expect(canDeleteProject(req, 'mgr1')).toBe(true);
  });

  it('returns false for collaborator (cannot delete)', () => {
    const req = mockReq({ id: 'u1', permissions: [], collaboratingProjectIds: ['p1'] });
    expect(canDeleteProject(req, 'other-mgr')).toBe(false);
  });

  it('returns false for regular user', () => {
    const req = mockReq({ id: 'u1', permissions: [] });
    expect(canDeleteProject(req, 'other-mgr')).toBe(false);
  });
});

// ─── sanitizePagination ─────────────────────────────────────
describe('sanitizePagination', () => {
  it('returns defaults for NaN values', () => {
    expect(sanitizePagination('abc', 'xyz')).toEqual({ pageNum: 1, pageSizeNum: 20 });
  });

  it('returns defaults for undefined', () => {
    expect(sanitizePagination(undefined, undefined)).toEqual({ pageNum: 1, pageSizeNum: 20 });
  });

  it('enforces minimum page of 1', () => {
    expect(sanitizePagination('0', '10')).toEqual({ pageNum: 1, pageSizeNum: 10 });
    expect(sanitizePagination('-5', '10')).toEqual({ pageNum: 1, pageSizeNum: 10 });
  });

  it('enforces minimum pageSize of 1', () => {
    expect(sanitizePagination('1', '0')).toEqual({ pageNum: 1, pageSizeNum: 20 });
    expect(sanitizePagination('1', '-1')).toEqual({ pageNum: 1, pageSizeNum: 20 });
  });

  it('caps pageSize at 100', () => {
    expect(sanitizePagination('1', '200')).toEqual({ pageNum: 1, pageSizeNum: 100 });
    expect(sanitizePagination('1', '101')).toEqual({ pageNum: 1, pageSizeNum: 100 });
  });

  it('parses valid numeric strings correctly', () => {
    expect(sanitizePagination('3', '25')).toEqual({ pageNum: 3, pageSizeNum: 25 });
  });

  it('permission with no colon separator never matches', () => {
    const req = mockReq({ permissions: ['admin'] });
    const res = mockRes();
    const next = vi.fn();
    requirePermission('project', 'read')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permission with multiple colons matches first two segments', () => {
    const req = mockReq({ permissions: ['project:read:extra'] });
    const res = mockRes();
    const next = vi.fn();
    requirePermission('project', 'read')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('sanitizePagination handles very large page number', () => {
    expect(sanitizePagination('999999', '10')).toEqual({ pageNum: 999999, pageSizeNum: 10 });
  });

  it('sanitizePagination truncates decimal values', () => {
    expect(sanitizePagination('2.7', '15.9')).toEqual({ pageNum: 2, pageSizeNum: 15 });
  });

  it('canDeleteProject returns false for collaborator who is not manager', () => {
    const req = {
      user: { id: 'u-collab', permissions: ['project:read'], collaboratingProjectIds: ['p1'] },
    } as unknown as Request;
    expect(canDeleteProject(req, 'u-manager')).toBe(false);
  });

  it('sanitizePagination handles empty string values', () => {
    expect(sanitizePagination('', '')).toEqual({ pageNum: 1, pageSizeNum: 20 });
  });

  it('sanitizePagination handles Infinity values', () => {
    expect(sanitizePagination('Infinity', 'Infinity')).toEqual({ pageNum: 1, pageSizeNum: 20 });
  });

  it('sanitizePagination caps pageSize at exactly 100', () => {
    expect(sanitizePagination('1', '100')).toEqual({ pageNum: 1, pageSizeNum: 100 });
  });

  it('canManageProject returns false when req.user is undefined', () => {
    const req = { user: undefined } as unknown as Request;
    expect(canManageProject(req, 'mgr1', 'p1')).toBe(false);
  });
});
