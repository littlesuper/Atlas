import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// canManageProject 默认 false = 非项目经理。当前 POST / 根本不调用它（也不查项目/不查归档）；
// 修复后应：查项目 → canManageProject → false → 403。
const { mockPrisma, mockCanManage, mockUser } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    riskItem: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
    riskItemLog: { create: vi.fn() },
    user: { findMany: vi.fn() },
  },
  mockCanManage: vi.fn().mockReturnValue(false),
  mockUser: {
    current: {
      id: 'stranger',
      username: 'stranger',
      realName: '局外人',
      roles: [],
      permissions: ['risk:read'],
      collaboratingProjectIds: [] as string[],
    },
  },
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = mockUser.current;
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  canManageProject: (...args: unknown[]) => mockCanManage(...args),
  sanitizePagination: (p: unknown, ps: unknown) => ({ pageNum: Number(p) || 1, pageSizeNum: Number(ps) || 20 }),
}));

vi.mock('../middleware/validate', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import riskItemRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(false);
  // 修复后会查项目取 managerId / status；这里给非归档 + 他人经理
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.riskItem.create.mockResolvedValue({ id: 'ri-new', projectId: 'p1', title: 'x', severity: 'HIGH' });
  mockPrisma.riskItemLog.create.mockResolvedValue({});
});

describe('POST /api/risk-items — authz', () => {
  // ── BUG: 创建风险项无 canManageProject / 归档校验 / 项目存在性校验 ──
  // riskItems.ts:74 的 POST / 只有 authenticate + validate；projectId 直接取自 body 写库。
  // 对比 activities/products/weeklyReports 的写路径都有 canManageProject + rejectIfArchived。
  // 任意已登录用户可向任意项目（含归档项目）注入风险项；传不存在的 projectId 还会 P2003→500。
  it('BUG: 非项目经理可向他人项目注入风险项（POST / 缺 canManageProject 校验）', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'p1', title: '被植入的风险', severity: 'CRITICAL' });

    // 期望（修复后）：非项目经理 → 403，不写库
    expect(res.status).toBe(403);
    expect(mockCanManage).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'p1');
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });

  it('项目经理创建自己项目的风险项应放行（修复后回归保护）', async () => {
    mockCanManage.mockReturnValue(true);
    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'p1', title: '正常风险', severity: 'HIGH' });

    expect(res.status).toBe(201);
    expect(mockPrisma.riskItem.create).toHaveBeenCalled();
  });
});
