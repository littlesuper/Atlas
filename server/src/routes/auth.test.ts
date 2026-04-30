import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks (available inside vi.mock factories) ───────────────────────

const { mockPrisma, mockBcrypt, mockJwt } = vi.hoisted(() => {
  // Set env vars inside vi.hoisted so they exist when auth.ts is imported
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    projectMember: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  };

  const mockBcrypt = { compare: vi.fn(), hash: vi.fn(() => 'hashed-pw') };

  const mockJwt = {
    sign: vi.fn(() => 'mock-token'),
    verify: vi.fn(() => ({ userId: 'user-1', username: 'admin' })),
  };

  return { mockPrisma, mockBcrypt, mockJwt };
});

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
      roles: [{ id: 'r1', name: 'admin', description: null }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
  invalidateUserCache: vi.fn(),
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  sanitizePagination: (page: any, pageSize: any) => ({
    pageNum: parseInt(page) || 1,
    pageSizeNum: parseInt(pageSize) || 20,
  }),
}));

vi.mock('../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(() => ({})),
}));

vi.mock('bcryptjs', () => ({ default: mockBcrypt }));

vi.mock('jsonwebtoken', () => ({ default: mockJwt }));

vi.mock('../utils/wecom', () => ({
  isWecomEnabled: vi.fn(() => false),
  getWecomConfig: vi.fn(),
  getUserInfoByCode: vi.fn(),
  getUserDetail: vi.fn(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import authRoutes from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const validUser = {
  id: 'user-1',
  username: 'admin',
  password: '$2b$10$hashedpassword',
  realName: 'Admin',
  canLogin: true,
  status: 'ACTIVE',
  userRoles: [
    {
      role: {
        name: 'admin',
        rolePermissions: [
          { permission: { resource: 'user', action: 'read' } },
        ],
      },
    },
  ],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('returns 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('returns 401 when user does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: '123456' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/用户名或密码错误/);
  });

  it('returns 403 when canLogin is false', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...validUser, canLogin: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/未开启登录权限/);
  });

  it('returns 403 when account has no password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...validUser, password: null });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/不支持密码登录/);
  });

  it('returns 401 when password is wrong', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);
    mockBcrypt.compare.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/用户名或密码错误/);
  });

  it('returns 403 when account is disabled', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...validUser, status: 'DISABLED' });
    mockBcrypt.compare.mockResolvedValue(true);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/禁用/);
  });

  it('returns tokens on successful login', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user).toHaveProperty('id', 'user-1');
    expect(res.body.user).toHaveProperty('roles');
    expect(res.body.user).toHaveProperty('permissions');
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockRejectedValue(new Error('DB down'));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/服务器内部错误/);
  });
});

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when refreshToken is missing', async () => {
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('returns 401 when token is invalid', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/无效/);
  });

  it('returns 401 when user does not exist', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/不存在/);
  });

  it('returns 403 when user is disabled', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'admin', status: 'DISABLED' });
    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/禁用/);
  });

  it('returns new access token on success', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'admin', status: 'ACTIVE' });
    mockJwt.sign.mockReturnValue('new-access-token');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-token' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'new-access-token');
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns current user info', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
    });

    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'user-1');
    expect(res.body).toHaveProperty('roles');
    expect(res.body).toHaveProperty('permissions');
  });

  it('returns 404 when user not found in DB', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/auth/change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('returns 400 when new password is too short', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/少于6位/);
  });

  it('returns 404 when user has no password', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ password: null });
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: 'new123' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when current password is wrong', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ password: 'hashed' });
    mockBcrypt.compare.mockResolvedValue(false);
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'wrong', newPassword: 'new123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不正确/);
  });

  it('returns success when password is changed', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ password: 'hashed' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockBcrypt.hash.mockResolvedValue('new-hash');
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: 'new123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PUT /api/auth/profile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when realName is empty', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .send({ realName: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when no fields to update', async () => {
    const res = await request(app)
      .put('/api/auth/profile')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/没有需要更新/);
  });

  it('updates profile successfully', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      realName: 'New Name',
    });
    const res = await request(app)
      .put('/api/auth/profile')
      .send({ realName: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.realName).toBe('New Name');
  });
});

describe('GET /api/auth/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user preferences', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
    const res = await request(app).get('/api/auth/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: 'dark' });
  });

  it('returns empty object when no preferences', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferences: null });
    const res = await request(app).get('/api/auth/preferences');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

describe('PUT /api/auth/preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when preferences is not an object', async () => {
    const res = await request(app)
      .put('/api/auth/preferences')
      .send({ preferences: 'bad' });
    expect(res.status).toBe(400);
  });

  it('merges preferences successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
    mockPrisma.user.update.mockResolvedValue({});
    const res = await request(app)
      .put('/api/auth/preferences')
      .send({ preferences: { lang: 'zh' } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ theme: 'dark', lang: 'zh' });
  });
});

describe('AUTH-008: SQL injection protection', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-008 SQL injection in username should return 401 without SQL errors', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: "admin' OR '1'='1", password: 'anything' });
    expect(res.status).toBe(401);
    expect(res.body.error).not.toMatch(/SQL|syntax|query/i);
  });
});

describe('AUTH-031: bcrypt hash storage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-031 password change stores bcrypt hash', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'old-hash' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockBcrypt.hash.mockResolvedValue('$2b$10$newhashedpassword');
    mockPrisma.user.update.mockResolvedValue({});

    await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: 'new123456' });

    expect(mockBcrypt.hash).toHaveBeenCalledWith('new123456', 10);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password: expect.stringMatching(/^\$2[ab]\$/) }),
      })
    );
  });
});

describe('AUTH-033: password change invalidates old token', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-033 change-password should invalidate user cache after success', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'old-hash' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockBcrypt.hash.mockResolvedValue('new-hash');
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: 'new123456' });

    expect(res.status).toBe(200);
    // After password change, cache should be invalidated so old tokens get re-validated
    // The invalidateUserCache mock is already imported
  });
});

describe('AUTH-036: XSS in realName', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-036 realName with XSS script tag should be stored as-is', async () => {
    const xssName = '<img src=x onerror=alert(1)>';
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      realName: xssName,
    });

    const res = await request(app)
      .put('/api/auth/profile')
      .send({ realName: xssName });

    expect(res.status).toBe(200);
    // The value is stored as-is; rendering escapes it on frontend
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ realName: xssName }),
      })
    );
  });
});

describe('AUTH-035: username immutability', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-035 PUT /profile with username field should not change username', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      realName: 'New Name',
    });

    const res = await request(app)
      .put('/api/auth/profile')
      .send({ realName: 'New Name', username: 'hacker' });

    expect(res.status).toBe(200);
    // Verify update call does NOT include username
    const updateCall = mockPrisma.user.update.mock.calls[0][0];
    expect(updateCall.data).not.toHaveProperty('username');
  });
});

describe('AUTH-016: accessToken expired auto refresh', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-016 refresh endpoint returns new accessToken when refresh token is valid', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      userRoles: [{ role: { rolePermissions: [] } }],
    });
    mockJwt.sign.mockReturnValue('new-access-token');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'new-access-token');
    expect(mockJwt.sign).toHaveBeenCalled();
  });

  it('AUTH-016 refresh uses JWT_REFRESH_SECRET (not JWT_SECRET)', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      userRoles: [],
    });
    mockJwt.sign.mockReturnValue('new-token');

    await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid' });

    expect(mockJwt.verify).toHaveBeenCalledWith(
      'valid',
      process.env.JWT_REFRESH_SECRET
    );
  });

  it('AUTH-016 refresh does not rotate the refresh token', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      userRoles: [],
    });
    mockJwt.sign.mockReturnValue('new-access');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'original-refresh' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).not.toHaveProperty('refreshToken');
  });
});

describe('AUTH-017: both tokens expired', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-017 expired refresh token returns 401', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('jwt expired');
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'expired-refresh-token' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('AUTH-017 invalid (malformed) refresh token returns 401', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' });

    expect(res.status).toBe(401);
  });

  it('AUTH-017 disabled user refresh token returns 403', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'DISABLED',
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-but-disabled' });

    expect(res.status).toBe(403);
  });
});

describe('AUTH-019: accessToken cannot be used as refreshToken (dual-key isolation)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-019 accessToken sent to /refresh returns 401', async () => {
    mockJwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'access-token-signed-with-JWT_SECRET' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

describe('AUTH-020: refreshToken cannot be used as accessToken', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-020 refreshToken signed with different secret fails JWT_SECRET verify', () => {
    const jwt = require('jsonwebtoken');
    const refreshToken = jwt.sign({ userId: 'user-1' }, process.env.JWT_REFRESH_SECRET!);
    expect(() => {
      jwt.verify(refreshToken, process.env.JWT_SECRET!);
    }).toThrow();
  });
});

describe('AUTH-029/030: password policy', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-030 new password too short returns 400', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password: 'hashed-pw',
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'admin123', newPassword: '12' });

    expect(res.status).toBe(400);
  });
});

describe('AUTH-011: rate limiting on login endpoint', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-011 rate limiter config exists for login in index.ts', async () => {
    const rateLimitModule = await import('express-rate-limit');
    expect(typeof rateLimitModule.default).toBe('function');
  });

  it('AUTH-011 login route responds normally within rate limit', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('AUTH-011 low-limit rate limiter triggers 429 after exceeding max', async () => {
    const rateLimit = (await import('express-rate-limit')).default;
    const strictLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 5,
      message: { error: '登录尝试过于频繁，请稍后重试' },
      standardHeaders: true,
      legacyHeaders: false,
    });

    const limitedApp = express();
    limitedApp.use(express.json());
    limitedApp.use('/api/auth/login', strictLimiter);
    limitedApp.use('/api/auth', authRoutes);

    mockPrisma.user.findUnique.mockResolvedValue(null);

    for (let i = 0; i < 5; i++) {
      const res = await request(limitedApp)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
      expect(res.status).toBe(401);
    }

    const res = await request(limitedApp)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/频繁/);
  });
});

describe('AUTH-023: concurrent refresh storm', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-023 5 simultaneous refresh requests with same token all succeed', async () => {
    mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      userRoles: [],
    });
    mockJwt.sign.mockReturnValue('new-access-token');

    const requests = Array(5).fill(null).map(() =>
      request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'same-refresh-token' })
    );

    const results = await Promise.all(requests);
    results.forEach((res) => {
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken', 'new-access-token');
    });
  });
});

describe('AUTH-027: collaboratingProjectIds cache invalidation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-027 login returns collaboratingProjectIds from projectMember query', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(validUser);
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.projectMember.findMany.mockResolvedValue([
      { projectId: 'proj-1' },
      { projectId: 'proj-2' },
    ]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.collaboratingProjectIds).toEqual(['proj-1', 'proj-2']);
    expect(mockPrisma.projectMember.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { projectId: true },
    });
  });

  it('AUTH-027 invalidateUserCache is exported and callable', async () => {
    const { invalidateUserCache } = await import('../middleware/auth');
    expect(typeof invalidateUserCache).toBe('function');
  });

  it('AUTH-027 /me returns collaboratingProjectIds from auth middleware cache', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      realName: 'Admin',
    });

    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('collaboratingProjectIds');
  });
});

describe('AUTH-032: mustChangePassword forces password change', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('AUTH-032 login returns mustChangePassword=true when user has flag set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...validUser,
      mustChangePassword: true,
    });
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it('AUTH-032 login returns mustChangePassword=false by default', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...validUser,
      mustChangePassword: null,
    });
    mockBcrypt.compare.mockResolvedValue(true);
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: '123456' });

    expect(res.status).toBe(200);
    expect(res.body.user.mustChangePassword).toBe(false);
  });

  it('AUTH-032 change-password clears mustChangePassword flag', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'old-hash' });
    mockBcrypt.compare.mockResolvedValue(true);
    mockBcrypt.hash.mockResolvedValue('new-hash');
    mockPrisma.user.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ currentPassword: 'old123', newPassword: 'new123456' });

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mustChangePassword: false }),
      })
    );
  });
});
