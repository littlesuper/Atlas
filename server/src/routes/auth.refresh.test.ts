import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
const { mockPrisma, mockJwt } = vi.hoisted(() => {
  // 必须在 vi.hoisted 内设环境变量，确保 auth 模块导入时已存在
  process.env.JWT_SECRET = 'test-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';

  const mockPrisma = {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    projectMember: { findMany: vi.fn() },
    $transaction: vi.fn((fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)),
  };
  const mockJwt = {
    sign: vi.fn(() => 'mock-access-token'),
    verify: vi.fn(() => ({ userId: 'user-1', username: 'admin' })),
  };
  return { mockPrisma, mockJwt };
});

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = { id: 'user-1', username: 'admin', realName: 'Admin', roles: [], permissions: ['*:*'], collaboratingProjectIds: [] };
    next();
  },
  invalidateUserCache: vi.fn(),
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  sanitizePagination: (p: unknown, ps: unknown) => ({ pageNum: parseInt(String(p), 10) || 1, pageSizeNum: parseInt(String(ps), 10) || 20 }),
}));

vi.mock('../utils/auditLog', () => ({ auditLog: vi.fn(), diffFields: vi.fn(() => ({})) }));
vi.mock('bcryptjs', () => ({ default: { compare: vi.fn(), hash: vi.fn(() => 'hashed-pw') } }));
vi.mock('jsonwebtoken', () => ({ default: mockJwt }));
vi.mock('../utils/wecom', () => ({
  isWecomEnabled: vi.fn(() => false),
  getWecomConfig: vi.fn(),
  getUserInfoByCode: vi.fn(),
  getUserDetail: vi.fn(),
}));

import authRoutes from './auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mockJwt.verify.mockReturnValue({ userId: 'user-1', username: 'admin' });
  mockJwt.sign.mockReturnValue('mock-access-token');
});

describe('POST /api/auth/refresh — canLogin 门控', () => {
  // ── BUG: refresh 只查 status===DISABLED，漏查 canLogin ──
  // 登录路径 session.ts:46-49 对 canLogin===false 返回 403「该账号未开启登录权限」；
  // refresh（session.ts:145-157）只挡 DISABLED，不挡 canLogin=false。
  // 管理员把某可登录用户改为「仅联系人」（canLogin:false）以撤销其访问，但其已签发的 refreshToken
  // 仍可在 7 天有效期内不断换发 accessToken——撤销不生效。
  it('BUG: canLogin=false 的用户仍可用 refreshToken 换发 accessToken（refresh 漏 canLogin 门控）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE', // 非 DISABLED，所以当前 refresh 会放行
      canLogin: false,   // 但已无登录权限——login 路径会挡，refresh 不挡
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    // 期望（修复后）：与 login 对齐 → 403，且不签发新 accessToken
    expect(res.status).toBe(403);
    expect(mockJwt.sign).not.toHaveBeenCalled();
  });

  it('可登录的 ACTIVE 用户刷新令牌应放行（修复后回归保护）', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'admin',
      status: 'ACTIVE',
      canLogin: true,
    });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'valid-refresh-token' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('DISABLED 用户刷新令牌仍被拦截（既有保护，确认未被破坏）', async () => {
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
  });
});
