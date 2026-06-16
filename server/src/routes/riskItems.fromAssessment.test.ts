import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
const { mockPrisma, mockCanManage, mockUser } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    riskAssessment: { findUnique: vi.fn() },
    riskItem: { create: vi.fn(), findFirst: vi.fn() },
    riskItemLog: { create: vi.fn() },
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

import riskItemRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemRoutes);

const assessment = {
  id: 'as-1',
  projectId: 'p1',
  aiEnhancedData: {
    actionItems: [{ action: '新增测试覆盖', priority: 'HIGH' }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(false);
  mockPrisma.riskAssessment.findUnique.mockResolvedValue(assessment);
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.riskItem.findFirst.mockResolvedValue(null); // 无去重命中
  mockPrisma.riskItem.create.mockResolvedValue({ id: 'ri-new', projectId: 'p1' });
  mockPrisma.riskItemLog.create.mockResolvedValue({});
});

describe('POST /api/risk-items/from-assessment/:assessmentId — authz', () => {
  // ── BUG: from-assessment 只 findUnique 评估记录查存在性，不查 canManageProject / 归档 ──
  // riskItems.ts:304-370：assessment.projectId 已在手却从不用于权限判定。
  // 任意登录用户知道一个 assessmentId 即可向该项目注入 AI 来源的风险项（含归档项目）。
  it('BUG: 非项目经理可借他人评估向项目注入风险项（from-assessment 缺 canManageProject 校验）', async () => {
    const res = await request(app).post('/api/risk-items/from-assessment/as-1');

    // 期望（修复后）：非项目经理 → 403，不写库
    expect(res.status).toBe(403);
    expect(mockCanManage).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'p1');
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });

  it('项目经理从自己项目的评估创建风险项应放行（修复后回归保护）', async () => {
    mockCanManage.mockReturnValue(true);
    const res = await request(app).post('/api/risk-items/from-assessment/as-1');

    expect(res.status).toBe(201);
    expect(mockPrisma.riskItem.create).toHaveBeenCalled();
  });
});
