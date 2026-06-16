import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
const { mockPrisma, mockCanManage, mockUser } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    riskItem: { findUnique: vi.fn(), update: vi.fn() },
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

vi.mock('../middleware/validate', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import riskItemRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemRoutes);

const existingItem = {
  id: 'ri-1',
  projectId: 'p1',
  title: '供应链延迟',
  description: '芯片交付延期',
  severity: 'HIGH',
  status: 'OPEN',
  ownerId: null,
  dueDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(false);
  mockPrisma.riskItem.findUnique.mockResolvedValue(existingItem);
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.riskItem.update.mockResolvedValue({ ...existingItem, owner: null });
  mockPrisma.riskItemLog.create.mockResolvedValue({});
});

describe('PUT /api/risk-items/:id — authz', () => {
  // ── BUG: PUT 只 findUnique 风险项查存在性，不查 canManageProject / 归档 ──
  // riskItems.ts:163-236：existing.projectId 已在手却从不用于权限判定。
  // 任意登录用户可改他人项目风险项的 severity（如 CRITICAL→LOW 掩盖风险）、status（→RESOLVED）、owner。
  it('BUG: 非项目经理可改他人项目的风险项（PUT /:id 缺 canManageProject 校验）', async () => {
    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ severity: 'LOW', status: 'RESOLVED' });

    // 期望（修复后）：非项目经理 → 403，不写库
    expect(res.status).toBe(403);
    expect(mockCanManage).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'p1');
    expect(mockPrisma.riskItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });

  it('项目经理改自己项目的风险项应放行（修复后回归保护）', async () => {
    mockCanManage.mockReturnValue(true);
    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ severity: 'LOW' });

    expect(res.status).toBe(200);
    expect(mockPrisma.riskItem.update).toHaveBeenCalled();
  });
});
