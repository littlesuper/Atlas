import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Request, Response } from 'express';

// ─── Hoisted mocks ──────────────────────────────────────────
const { mockVerify, mockFindUnique, mockFindMany } = vi.hoisted(() => ({
  mockVerify: vi.fn(),
  mockFindUnique: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock('jsonwebtoken', () => ({
  default: { verify: mockVerify, TokenExpiredError: class TokenExpiredError extends Error {} },
  verify: mockVerify,
  TokenExpiredError: class TokenExpiredError extends Error {},
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    user = { findUnique: mockFindUnique };
    projectMember = { findMany: mockFindMany };
  },
}));

// ─── Import after mocks are set up ─────────────────────────
import { authenticate, invalidateUserCache, invalidateAllUserCache } from './auth';
import jwt from 'jsonwebtoken';

// Helpers
function mockReq(authHeader?: string): Request {
  return {
    headers: { authorization: authHeader },
    query: {},
  } as unknown as Request;
}

function mockRes() {
  const res: Partial<Response> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as Response;
}

const VALID_USER = {
  id: 'u1',
  username: 'testuser',
  realName: 'Test User',
  status: 'ACTIVE',
  userRoles: [
    {
      role: {
        id: 'r1',
        name: 'Admin',
        description: 'Administrator',
        rolePermissions: [
          { permission: { resource: 'project', action: 'read' } },
          { permission: { resource: 'project', action: 'create' } },
        ],
      },
    },
  ],
};

describe('authenticate middleware', () => {
  const originalEnv = process.env.JWT_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    // Clear internal cache between tests
    invalidateAllUserCache();
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnv;
  });

  // ─── No header / invalid header ────────────────────────
  it('returns 401 when no authorization header', async () => {
    const req = mockReq(undefined);
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when header does not start with Bearer', async () => {
    const req = mockReq('Basic abc123');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ─── Missing JWT_SECRET ────────────────────────────────
  it('returns 500 when JWT_SECRET is not set', async () => {
    delete process.env.JWT_SECRET;
    const req = mockReq('Bearer some-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  // ─── Token issues ──────────────────────────────────────
  it('returns 401 when token is expired', async () => {
    mockVerify.mockImplementation(() => {
      throw new jwt.TokenExpiredError('expired', new Date());
    });
    const req = mockReq('Bearer expired-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('过期') }));
  });

  it('returns 401 when token is invalid', async () => {
    mockVerify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const req = mockReq('Bearer bad-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ─── User not found ────────────────────────────────────
  it('returns 401 when user does not exist', async () => {
    mockVerify.mockReturnValue({ userId: 'u-missing', username: 'ghost' });
    mockFindUnique.mockResolvedValue(null);
    const req = mockReq('Bearer valid-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  // ─── DISABLED user ─────────────────────────────────────
  it('returns 403 when user is DISABLED', async () => {
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue({ ...VALID_USER, status: 'DISABLED' });
    const req = mockReq('Bearer valid-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  // ─── Success ───────────────────────────────────────────
  it('attaches user with roles/permissions/collaboratingProjectIds on success', async () => {
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue(VALID_USER);
    mockFindMany.mockResolvedValue([{ projectId: 'p1' }, { projectId: 'p2' }]);

    const req = mockReq('Bearer valid-token');
    const res = mockRes();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user!.id).toBe('u1');
    expect(req.user!.roles).toHaveLength(1);
    expect(req.user!.roles[0].name).toBe('Admin');
    expect(req.user!.permissions).toContain('project:read');
    expect(req.user!.permissions).toContain('project:create');
    expect(req.user!.collaboratingProjectIds).toEqual(['p1', 'p2']);
  });

  // ─── Cache behavior ────────────────────────────────────
  it('uses cache on second call (does not query DB again)', async () => {
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue(VALID_USER);
    mockFindMany.mockResolvedValue([]);

    // First call — populates cache
    const req1 = mockReq('Bearer valid-token');
    const res1 = mockRes();
    await authenticate(req1, res1, vi.fn());
    expect(mockFindUnique).toHaveBeenCalledTimes(1);

    // Second call — should hit cache
    const req2 = mockReq('Bearer valid-token');
    const res2 = mockRes();
    const next2 = vi.fn();
    await authenticate(req2, res2, next2);

    expect(next2).toHaveBeenCalled();
    expect(mockFindUnique).toHaveBeenCalledTimes(1); // Not called again
  });

  it('invalidateUserCache forces re-query', async () => {
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue(VALID_USER);
    mockFindMany.mockResolvedValue([]);

    // First call
    const req1 = mockReq('Bearer valid-token');
    await authenticate(req1, mockRes(), vi.fn());
    expect(mockFindUnique).toHaveBeenCalledTimes(1);

    // Invalidate
    invalidateUserCache('u1');

    // Second call — should re-query
    const req2 = mockReq('Bearer valid-token');
    await authenticate(req2, mockRes(), vi.fn());
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  it('invalidateAllUserCache clears all entries', async () => {
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue(VALID_USER);
    mockFindMany.mockResolvedValue([]);

    // Populate cache
    const req1 = mockReq('Bearer valid-token');
    await authenticate(req1, mockRes(), vi.fn());

    // Clear all
    invalidateAllUserCache();

    // Should re-query
    const req2 = mockReq('Bearer valid-token');
    await authenticate(req2, mockRes(), vi.fn());
    expect(mockFindUnique).toHaveBeenCalledTimes(2);
  });

  it('deduplicates permissions from multiple roles', async () => {
    const userWithDuplicatePerms = {
      ...VALID_USER,
      userRoles: [
        {
          role: {
            id: 'r1', name: 'Admin', description: null,
            rolePermissions: [
              { permission: { resource: 'project', action: 'read' } },
            ],
          },
        },
        {
          role: {
            id: 'r2', name: 'Manager', description: null,
            rolePermissions: [
              { permission: { resource: 'project', action: 'read' } },
              { permission: { resource: 'user', action: 'read' } },
            ],
          },
        },
      ],
    };
    mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
    mockFindUnique.mockResolvedValue(userWithDuplicatePerms);
    mockFindMany.mockResolvedValue([]);

    const req = mockReq('Bearer valid-token');
    const next = vi.fn();
    await authenticate(req, mockRes(), next);

    expect(next).toHaveBeenCalled();
    // project:read should appear only once
    const projectReadCount = req.user!.permissions.filter(p => p === 'project:read').length;
    expect(projectReadCount).toBe(1);
    expect(req.user!.permissions).toContain('user:read');
  });

  describe('AUTH-022: algorithm=none attack', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.JWT_SECRET = 'test-secret';
      invalidateAllUserCache();
    });

    it('AUTH-022 rejects JWT with alg=none in header', async () => {
      // Create a token with alg:none header
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ userId: 'u1', username: 'testuser' })).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      mockVerify.mockImplementation(() => {
        throw new Error('invalid algorithm');
      });

      const req = mockReq(`Bearer ${noneToken}`);
      const res = mockRes();
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('AUTH-021: JWT signature tampering', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.JWT_SECRET = 'test-secret';
      invalidateAllUserCache();
    });

    it('AUTH-021 rejects JWT with modified payload', async () => {
      mockVerify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const req = mockReq('Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJoYWNrZXIiLCJ1c2VybmFtZSI6ImFkbWluIn0.tampered');
      const res = mockRes();
      const next = vi.fn();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('CHAOS-006: JWT_SECRET change invalidates old tokens', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      invalidateAllUserCache();
    });

    it('CHAOS-006 tokens signed with old secret fail verification after secret change', async () => {
      // First verify with original secret works
      process.env.JWT_SECRET = 'old-secret';
      mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
      mockFindUnique.mockResolvedValue(VALID_USER);
      mockFindMany.mockResolvedValue([]);

      const req1 = mockReq('Bearer old-secret-token');
      const res1 = mockRes();
      const next1 = vi.fn();
      await authenticate(req1, res1, next1);
      expect(next1).toHaveBeenCalled();

      // Now change secret - old tokens should fail
      invalidateAllUserCache();
      process.env.JWT_SECRET = 'new-secret';
      mockVerify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const req2 = mockReq('Bearer old-secret-token');
      const res2 = mockRes();
      const next2 = vi.fn();
      await authenticate(req2, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(401);
      expect(next2).not.toHaveBeenCalled();
    });
  });

  describe('AUTH-025: disabled user immediately effective via cache', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.JWT_SECRET = 'test-secret';
      invalidateAllUserCache();
    });

    it('AUTH-025 cached user that gets disabled should be rejected on cache invalidation', async () => {
      mockVerify.mockReturnValue({ userId: 'u1', username: 'testuser' });
      mockFindUnique.mockResolvedValue(VALID_USER);
      mockFindMany.mockResolvedValue([]);

      // First call - user is active, should succeed
      const req1 = mockReq('Bearer valid-token');
      const next1 = vi.fn();
      await authenticate(req1, mockRes(), next1);
      expect(next1).toHaveBeenCalled();

      // Invalidate cache (simulating admin disabling user)
      invalidateUserCache('u1');

      // Re-mock as disabled
      mockFindUnique.mockResolvedValue({ ...VALID_USER, status: 'DISABLED' });

      const req2 = mockReq('Bearer valid-token');
      const res2 = mockRes();
      const next2 = vi.fn();
      await authenticate(req2, res2, next2);
      expect(res2.status).toHaveBeenCalledWith(403);
    });
  });
});
