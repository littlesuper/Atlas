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
