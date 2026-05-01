import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient as PrismaClientType } from '@prisma/client';
import request from 'supertest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    riskItem: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    riskItemLog: {
      create: vi.fn(),
    },
    riskAssessment: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
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
}));

vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import riskItemsRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemsRoutes);

const sampleRiskItem = {
  id: 'ri-1',
  projectId: 'proj-1',
  assessmentId: null,
  title: '供应链风险',
  description: null,
  severity: 'HIGH',
  status: 'OPEN',
  ownerId: null,
  dueDate: null,
  source: 'manual',
  createdAt: new Date('2026-05-01T00:00:00.000Z'),
  updatedAt: new Date('2026-05-01T00:00:00.000Z'),
};

describe('GET /api/risk-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters risk items and sanitizes pagination before querying', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([sampleRiskItem]);
    mockPrisma.riskItem.count.mockResolvedValue(1);

    const res = await request(app).get('/api/risk-items?projectId=proj-1&status=OPEN&page=-2&pageSize=500');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 100 });
    expect(mockPrisma.riskItem.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', status: 'OPEN' },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      skip: 0,
      take: 100,
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });
    expect(mockPrisma.riskItem.count).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', status: 'OPEN' },
    });
  });
});

describe('POST /api/risk-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a manual risk item and writes a CREATED log', async () => {
    const created = {
      ...sampleRiskItem,
      title: '关键物料短缺',
      owner: { id: 'user-2', realName: '张三' },
    };
    mockPrisma.riskItem.create.mockResolvedValue(created);
    mockPrisma.riskItemLog.create.mockResolvedValue({ id: 'log-1' });

    const res = await request(app)
      .post('/api/risk-items')
      .send({
        projectId: 'proj-1',
        title: '关键物料短缺',
        description: '主供应商交期延迟',
        severity: 'CRITICAL',
        ownerId: 'user-2',
        dueDate: '2026-05-15T00:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('关键物料短缺');
    expect(mockPrisma.riskItem.create).toHaveBeenCalledWith({
      data: {
        projectId: 'proj-1',
        assessmentId: null,
        title: '关键物料短缺',
        description: '主供应商交期延迟',
        severity: 'CRITICAL',
        ownerId: 'user-2',
        dueDate: new Date('2026-05-15T00:00:00.000Z'),
        source: 'manual',
      },
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith({
      data: {
        riskItemId: 'ri-1',
        action: 'CREATED',
        content: '创建风险项「关键物料短缺」，严重度: CRITICAL',
        userId: 'user-1',
      },
    });
  });

  it('rejects invalid severity before writing any risk item', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({
        projectId: 'proj-1',
        title: '非法严重度',
        severity: 'BLOCKER',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请求参数校验失败');
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enriches logs with users and falls back to unknown users', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue({
      ...sampleRiskItem,
      logs: [
        { id: 'log-1', riskItemId: 'ri-1', userId: 'user-2', action: 'CREATED', content: '创建' },
        { id: 'log-2', riskItemId: 'ri-1', userId: 'missing-user', action: 'COMMENTED', content: '跟进' },
      ],
    });
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-2', realName: '张三' }]);

    const res = await request(app).get('/api/risk-items/ri-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-2', 'missing-user'] } },
      select: { id: true, realName: true },
    });
    expect(res.body.logs[0].user).toEqual({ id: 'user-2', realName: '张三' });
    expect(res.body.logs[1].user).toEqual({ id: 'missing-user', realName: '未知用户' });
  });
});

describe('PUT /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets resolvedAt and writes a status-change log when resolving a risk item', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockImplementation((args: { data: Record<string, unknown> }) => Promise.resolve({
      ...sampleRiskItem,
      ...args.data,
    }));
    mockPrisma.riskItemLog.create.mockResolvedValue({ id: 'log-1' });

    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(200);
    expect(mockPrisma.riskItem.update).toHaveBeenCalledWith({
      where: { id: 'ri-1' },
      data: {
        status: 'RESOLVED',
        resolvedAt: expect.any(Date),
      },
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith({
      data: {
        riskItemId: 'ri-1',
        action: 'STATUS_CHANGED',
        content: '状态从 OPEN 变更为 RESOLVED',
        userId: 'user-1',
      },
    });
  });

  it('does not write audit logs when submitted fields do not change', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockResolvedValue(sampleRiskItem);

    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({
        title: sampleRiskItem.title,
        severity: sampleRiskItem.severity,
        status: sampleRiskItem.status,
        ownerId: sampleRiskItem.ownerId,
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.riskItem.update).toHaveBeenCalledWith({
      where: { id: 'ri-1' },
      data: {},
      include: {
        owner: { select: { id: true, realName: true } },
      },
    });
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 and does not delete when the risk item is missing', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/risk-items/missing-risk');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('风险项不存在');
    expect(mockPrisma.riskItem.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/risk-items/:id/comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty comments before reading or writing risk item data', async () => {
    const res = await request(app)
      .post('/api/risk-items/ri-1/comment')
      .send({ content: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请求参数校验失败');
    expect(mockPrisma.riskItem.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.riskItemLog.create).not.toHaveBeenCalled();
  });

  it('adds a comment log and returns the commenter profile', async () => {
    const commentLog = {
      id: 'log-comment',
      riskItemId: 'ri-1',
      action: 'COMMENTED',
      content: '已联系供应商',
      userId: 'user-1',
    };
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItemLog.create.mockResolvedValue(commentLog);
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', realName: 'Admin' });

    const res = await request(app)
      .post('/api/risk-items/ri-1/comment')
      .send({ content: '已联系供应商' });

    expect(res.status).toBe(201);
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith({
      data: {
        riskItemId: 'ri-1',
        action: 'COMMENTED',
        content: '已联系供应商',
        userId: 'user-1',
      },
    });
    expect(res.body.user).toEqual({ id: 'user-1', realName: 'Admin' });
  });
});

describe('POST /api/risk-items/from-assessment/:assessmentId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 and does not create risk items when the assessment is missing', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/risk-items/from-assessment/missing-assessment');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('评估记录不存在');
    expect(mockPrisma.riskItem.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
  });

  it('imports only non-duplicate AI action items and writes CREATED logs', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue({
      id: 'assess-1',
      projectId: 'proj-1',
      aiEnhancedData: {
        actionItems: [
          { action: '锁定替代供应商', priority: 'HIGH' },
          { action: '补充风险缓冲', priority: 'UNKNOWN' },
        ],
      },
    });
    mockPrisma.riskItem.findFirst
      .mockResolvedValueOnce({ id: 'existing-risk' })
      .mockResolvedValueOnce(null);
    mockPrisma.riskItem.create.mockResolvedValue({
      ...sampleRiskItem,
      id: 'created-risk',
      title: '补充风险缓冲',
      source: 'ai',
      severity: 'MEDIUM',
    });
    mockPrisma.riskItemLog.create.mockResolvedValue({ id: 'log-created' });

    const res = await request(app).post('/api/risk-items/from-assessment/assess-1');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(1);
    expect(mockPrisma.riskItem.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        projectId: 'proj-1',
        title: '锁定替代供应商',
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
    });
    expect(mockPrisma.riskItem.create).toHaveBeenCalledWith({
      data: {
        projectId: 'proj-1',
        assessmentId: 'assess-1',
        title: '补充风险缓冲',
        severity: 'MEDIUM',
        source: 'ai',
      },
    });
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith({
      data: {
        riskItemId: 'created-risk',
        action: 'CREATED',
        content: '从 AI 评估自动创建',
        userId: 'user-1',
      },
    });
  });
});
