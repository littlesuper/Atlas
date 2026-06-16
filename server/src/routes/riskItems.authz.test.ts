import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import request from 'supertest';

// 越权防护回归（GLM QA #84/#88/#89/#90）：风险项写操作必须按所属项目做 canManageProject + 归档校验。
// 这里用真实 canManageProject（不 mock 权限中间件）：局外人 → 403；项目经理 → 放行。
const { mockPrisma, mockUser } = vi.hoisted(() => ({
  mockPrisma: {
    riskItem: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), findFirst: vi.fn() },
    riskItemLog: { create: vi.fn() },
    riskAssessment: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
  },
  mockUser: {
    current: {
      id: 'stranger',
      username: 'stranger',
      realName: '局外人',
      roles: [] as Array<{ id: string; name: string; description: string | null }>,
      permissions: ['risk:read', 'risk:create', 'risk:update', 'risk:delete'],
      collaboratingProjectIds: [] as string[],
    },
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClientType;
    }
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request & { user?: unknown }, _res: Response, next: NextFunction) => {
    req.user = mockUser.current;
    next();
  },
}));

vi.mock('../middleware/validate', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import riskItemsRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemsRoutes);

const existingItem = {
  id: 'ri-1',
  projectId: 'proj-1',
  title: '供应链风险',
  description: null,
  severity: 'HIGH',
  status: 'OPEN',
  ownerId: null,
  dueDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.current = {
    id: 'stranger',
    username: 'stranger',
    realName: '局外人',
    roles: [],
    permissions: ['risk:read', 'risk:create', 'risk:update', 'risk:delete'],
    collaboratingProjectIds: [],
  };
  // 项目经理是 owner-1，当前用户是 stranger（非经理、非协作、非管理员）。
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.riskItem.findUnique.mockResolvedValue(existingItem);
  mockPrisma.riskAssessment.findUnique.mockResolvedValue({
    id: 'assess-1',
    projectId: 'proj-1',
    aiEnhancedData: { actionItems: [{ action: '锁定替代供应商', priority: 'HIGH' }] },
  });
  mockPrisma.riskItem.findFirst.mockResolvedValue(null);
});

describe('risk-items 越权防护 (IDOR)', () => {
  it('POST / 非项目经理 → 403，不创建', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', title: '注入风险', severity: 'HIGH' });
    expect(res.status).toBe(403);
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
  });

  it('PUT /:id 非项目经理 → 403，不更新（无法降级 severity / 改 status）', async () => {
    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ severity: 'LOW', status: 'RESOLVED' });
    expect(res.status).toBe(403);
    expect(mockPrisma.riskItem.update).not.toHaveBeenCalled();
  });

  it('DELETE /:id 非项目经理 → 403，不删除', async () => {
    const res = await request(app).delete('/api/risk-items/ri-1');
    expect(res.status).toBe(403);
    expect(mockPrisma.riskItem.delete).not.toHaveBeenCalled();
  });

  it('POST /from-assessment/:id 非项目经理 → 403，不批量创建', async () => {
    const res = await request(app).post('/api/risk-items/from-assessment/assess-1');
    expect(res.status).toBe(403);
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
  });

  it('归档项目 → 403（即便是项目经理也不可改）', async () => {
    mockUser.current = { ...mockUser.current, id: 'owner-1' };
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', managerId: 'owner-1', status: 'ARCHIVED' });
    const res = await request(app).put('/api/risk-items/ri-1').send({ severity: 'LOW' });
    expect(res.status).toBe(403);
    expect(mockPrisma.riskItem.update).not.toHaveBeenCalled();
  });

  it('项目经理改自己项目的风险项 → 放行 (200)（回归伴侣）', async () => {
    mockUser.current = { ...mockUser.current, id: 'owner-1' };
    mockPrisma.riskItem.update.mockResolvedValue({ ...existingItem, severity: 'LOW', owner: null });
    mockPrisma.riskItemLog.create.mockResolvedValue({});
    const res = await request(app).put('/api/risk-items/ri-1').send({ severity: 'LOW' });
    expect(res.status).toBe(200);
    expect(mockPrisma.riskItem.update).toHaveBeenCalled();
  });
});
