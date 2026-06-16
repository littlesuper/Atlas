import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import type { PrismaClient } from '../generated/prisma/client';

type AuthRequest = Request & { user?: unknown };

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
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
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((ops: Iterable<unknown>) => Promise.all(ops)),
  };
  return { mockPrisma };
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

vi.mock('../middleware/validate', () => ({
  validate: () => (req: Request, _res: Response, next: NextFunction) => next(),
}));

import riskItemRoutes from './riskItems';

const app = express();
app.use(express.json());
app.use('/api/risk-items', riskItemRoutes);

const sampleRiskItem = {
  id: 'ri-1',
  projectId: 'proj-1',
  assessmentId: null,
  title: 'Test Risk',
  description: 'A test risk item',
  severity: 'HIGH',
  status: 'OPEN',
  ownerId: 'user-1',
  dueDate: null,
  source: 'manual',
  createdAt: new Date('2026-05-01'),
  updatedAt: new Date('2026-05-01'),
  resolvedAt: null,
  owner: { id: 'user-1', realName: 'Admin' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/risk-items
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/risk-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated risk items', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([sampleRiskItem]);
    mockPrisma.riskItem.count.mockResolvedValue(1);

    const res = await request(app).get('/api/risk-items');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(20);
  });

  it('filters by projectId', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([]);
    mockPrisma.riskItem.count.mockResolvedValue(0);

    await request(app).get('/api/risk-items?projectId=proj-1');

    expect(mockPrisma.riskItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'proj-1' }),
      }),
    );
  });

  it('filters by status', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([]);
    mockPrisma.riskItem.count.mockResolvedValue(0);

    await request(app).get('/api/risk-items?status=OPEN');

    expect(mockPrisma.riskItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'OPEN' }),
      }),
    );
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/risk-items');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/risk-items
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/risk-items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 越权门：项目须存在、非归档、当前管理员可管理（user-1 持 *:*）
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', managerId: 'user-1', status: 'IN_PROGRESS' });
  });

  it('creates a risk item and returns 201', async () => {
    mockPrisma.riskItem.create.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', title: 'Test Risk', severity: 'HIGH' });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('ri-1');
    expect(mockPrisma.riskItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          projectId: 'proj-1',
          title: 'Test Risk',
          severity: 'HIGH',
          source: 'manual',
        }),
      }),
    );
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'CREATED' }),
      }),
    );
  });

  it('sets source to manual when not provided', async () => {
    mockPrisma.riskItem.create.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', title: 'Test Risk', severity: 'HIGH' });

    expect(mockPrisma.riskItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: 'manual' }),
      }),
    );
  });

  it('returns 400 when projectId is missing', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({ title: 'Test Risk', severity: 'HIGH' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', severity: 'HIGH' });

    expect(res.status).toBe(400);
  });

  it('returns 400 when severity is missing', async () => {
    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', title: 'Test Risk' });

    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'proj-1', title: 'Test Risk', severity: 'HIGH' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/risk-items/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns risk item with logs and user info', async () => {
    const itemWithLogs = {
      ...sampleRiskItem,
      logs: [
        { id: 'log-1', action: 'CREATED', content: 'created', userId: 'user-1', createdAt: new Date() },
      ],
    };
    mockPrisma.riskItem.findUnique.mockResolvedValue(itemWithLogs);
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-1', realName: 'Admin' }]);

    const res = await request(app).get('/api/risk-items/ri-1');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('ri-1');
    expect(res.body.logs[0].user.realName).toBe('Admin');
  });

  it('returns 404 when risk item does not exist', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/risk-items/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/risk-items/ri-1');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/risk-items/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 越权门：项目须存在、非归档、当前管理员(*:*)可管理
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', managerId: 'user-1', status: 'IN_PROGRESS' });
  });

  it('updates status and creates a log', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockResolvedValue({ ...sampleRiskItem, status: 'IN_PROGRESS' });
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ status: 'IN_PROGRESS' });

    expect(res.status).toBe(200);
    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'STATUS_CHANGED' }),
      }),
    );
  });

  it('sets resolvedAt when status is RESOLVED', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockResolvedValue({ ...sampleRiskItem, status: 'RESOLVED' });
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    await request(app)
      .put('/api/risk-items/ri-1')
      .send({ status: 'RESOLVED' });

    expect(mockPrisma.riskItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
      }),
    );
  });

  it('creates SEVERITY_CHANGED log when severity changes', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockResolvedValue({ ...sampleRiskItem, severity: 'CRITICAL' });
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    await request(app)
      .put('/api/risk-items/ri-1')
      .send({ severity: 'CRITICAL' });

    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'SEVERITY_CHANGED' }),
      }),
    );
  });

  it('creates ASSIGNED log when ownerId changes', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.update.mockResolvedValue({ ...sampleRiskItem, ownerId: 'user-2' });
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    await request(app)
      .put('/api/risk-items/ri-1')
      .send({ ownerId: 'user-2' });

    expect(mockPrisma.riskItemLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'ASSIGNED' }),
      }),
    );
  });

  it('returns 404 when risk item does not exist', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/risk-items/nonexistent')
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ status: 'RESOLVED' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/risk-items/:id
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/risk-items/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes a risk item and returns success', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItem.delete.mockResolvedValue(sampleRiskItem);

    const res = await request(app).delete('/api/risk-items/ri-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 404 when risk item does not exist', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/risk-items/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/risk-items/ri-1');

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/risk-items/:id/comment
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/risk-items/:id/comment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds a comment and returns 201', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(sampleRiskItem);
    mockPrisma.riskItemLog.create.mockResolvedValue({
      id: 'log-1',
      action: 'COMMENTED',
      content: 'Test comment',
      userId: 'user-1',
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', realName: 'Admin' });

    const res = await request(app)
      .post('/api/risk-items/ri-1/comment')
      .send({ content: 'Test comment' });

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('COMMENTED');
    expect(res.body.user.realName).toBe('Admin');
  });

  it('returns 404 when risk item does not exist', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/risk-items/nonexistent/comment')
      .send({ content: 'Test comment' });

    expect(res.status).toBe(404);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/risk-items/ri-1/comment')
      .send({ content: 'Test comment' });

    expect(res.status).toBe(500);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/risk-items/from-assessment/:assessmentId
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/risk-items/from-assessment/:assessmentId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates risk items from assessment action items', async () => {
    const assessment = {
      id: 'assess-1',
      projectId: 'proj-1',
      aiEnhancedData: {
        actionItems: [
          { action: 'Fix login bug', priority: 'HIGH' },
          { action: 'Update docs', priority: 'LOW' },
        ],
      },
    };
    mockPrisma.riskAssessment.findUnique.mockResolvedValue(assessment);
    mockPrisma.riskItem.findFirst.mockResolvedValue(null);
    mockPrisma.riskItem.create.mockImplementation(({ data }: { data: { title: string } }) =>
      Promise.resolve({ id: `ri-${data.title}`, ...data }),
    );
    mockPrisma.riskItemLog.create.mockResolvedValue({});

    const res = await request(app)
      .post('/api/risk-items/from-assessment/assess-1');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(2);
  });

  it('skips duplicate action items', async () => {
    const assessment = {
      id: 'assess-1',
      projectId: 'proj-1',
      aiEnhancedData: {
        actionItems: [{ action: 'Fix login bug', priority: 'HIGH' }],
      },
    };
    mockPrisma.riskAssessment.findUnique.mockResolvedValue(assessment);
    mockPrisma.riskItem.findFirst.mockResolvedValue({ id: 'existing-ri' });

    const res = await request(app)
      .post('/api/risk-items/from-assessment/assess-1');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(0);
    expect(mockPrisma.riskItem.create).not.toHaveBeenCalled();
  });

  it('returns 404 when assessment does not exist', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/risk-items/from-assessment/nonexistent');

    expect(res.status).toBe(404);
  });

  it('returns 400 when assessment has no action items', async () => {
    mockPrisma.riskAssessment.findUnique.mockResolvedValue({
      id: 'assess-1',
      projectId: 'proj-1',
      aiEnhancedData: null,
    });

    const res = await request(app)
      .post('/api/risk-items/from-assessment/assess-1');

    expect(res.status).toBe(400);
  });

  it('returns 500 on database error', async () => {
    mockPrisma.riskAssessment.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/risk-items/from-assessment/assess-1');

    expect(res.status).toBe(500);
  });

  it('GET returns empty list for project with no risk items', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([]);
    mockPrisma.riskItem.count.mockResolvedValue(0);

    const res = await request(app).get('/api/risk-items?projectId=p-empty');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('POST create returns 500 on database error', async () => {
    mockPrisma.riskItem.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'p1', title: '风险项', severity: 'HIGH' });

    expect(res.status).toBe(500);
  });

  it('GET returns 500 on database error', async () => {
    mockPrisma.riskItem.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/risk-items?projectId=p1');

    expect(res.status).toBe(500);
  });

  it('DELETE returns 404 when risk item not found', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/risk-items/missing-id');

    expect(res.status).toBe(404);
  });

  it('POST create returns 500 on database error', async () => {
    mockPrisma.riskItem.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/risk-items')
      .send({ projectId: 'p1', title: 'Risk', severity: 'HIGH' });

    expect(res.status).toBe(500);
  });

  it('DELETE returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue({ id: 'item-1' });
    mockPrisma.riskItem.delete.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/risk-items/item-1');

    expect(res.status).toBe(500);
  });

  it('GET returns empty array when no risk items match filter', async () => {
    mockPrisma.riskItem.findMany.mockResolvedValue([]);
    mockPrisma.riskItem.count.mockResolvedValue(0);

    const res = await request(app).get('/api/risk-items?status=RESOLVED');

    expect(res.status).toBe(200);
  });

  it('PUT update returns 500 on database error', async () => {
    mockPrisma.riskItem.findUnique.mockResolvedValue({ id: 'ri-1', status: 'OPEN' });
    mockPrisma.riskItem.update.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .put('/api/risk-items/ri-1')
      .send({ title: 'Updated Risk' });

    expect(res.status).toBe(500);
  });
});
