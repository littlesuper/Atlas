import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks (available inside vi.mock factories) ───────────────────────
// 与 auth.test.ts 同 mock 风格：@prisma/client + jsonwebtoken（default 导出）。

const { mockPrisma, mockJwt } = vi.hoisted(() => {
  // 在 vi.hoisted 内设置环境变量，确保 auth.ts 导入时已存在 JWT secret。
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

  const mockJwt = {
    sign: vi.fn(() => 'mock-access-token'),
    verify: vi.fn(() => ({ userId: 'user-1', username: 'admin' })),
  };

  return { mockPrisma, mockJwt };
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
      roles: [],
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

vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn(() => 'hashed-pw') } }));

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

beforeEach(() => {
  vi.clearAllMocks();
  // 默认：refreshToken 可解析为 user-1；sign 返回固定值。
  mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
  mockJwt.sign.mockReturnValue('mock-access-token');
});

// ── #85: refresh 换发令牌漏查 canLogin（撤销登录不生效） ──
// 登录路径对 canLogin===false 返回 403「该账号未开启登录权限」；
// 原 refresh 只挡 status===DISABLED，不挡 canLogin=false。
// 管理员把可登录用户改为「仅联系人」(canLogin:false) 以撤销访问，但其已签发的
// refreshToken 仍可在有效期内不断换发 accessToken——撤销不生效。修复后应与 login 对齐。
describe('POST /api/auth/refresh — canLogin 门控 (#85)', () => {
  it('canLogin=false 且 status 正常时返回 403，且不签发新 accessToken', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE', // 非 DISABLED，原 refresh 会放行
      canLogin: false, // 但已无登录权限——login 路径会挡，修复后 refresh 也应挡
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('accessToken');
    expect(mockJwt.sign).not.toHaveBeenCalled();
  });

  it('canLogin=true 且 status 正常时返回 200 并签发新 accessToken（回归保护）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      canLogin: true,
    });
    mockJwt.sign.mockReturnValue('new-access-token');

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken', 'new-access-token');
  });

  it('DISABLED 用户刷新令牌仍被拦截（既有保护未被破坏）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'DISABLED',
      canLogin: true,
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(403);
    expect(mockJwt.sign).not.toHaveBeenCalled();
  });
});
