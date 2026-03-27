import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockIsAdmin } = vi.hoisted(() => {
  const mockPrisma = {
    projectTemplate: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    templateActivity: {
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  };
  const mockIsAdmin = vi.fn().mockReturnValue(true);
  return { mockPrisma, mockIsAdmin };
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
      realName: '管理员',
      roles: [{ name: '系统管理员' }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
  isAdmin: mockIsAdmin,
  canManageProject: vi.fn().mockReturnValue(true),
  canDeleteProject: vi.fn().mockReturnValue(true),
}));

vi.mock('../utils/dependencyScheduler', () => ({
  resolveActivityDates: vi.fn(),
}));

vi.mock('../utils/workday', () => ({
  offsetWorkdays: vi.fn((d: Date) => d),
  calculateWorkdays: vi.fn(() => 1),
}));

vi.mock('../utils/projectProgress', () => ({
  updateProjectProgress: vi.fn(),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import templatesRoutes from './templates';

const app = express();
app.use(express.json());
app.use('/api/templates', templatesRoutes);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it('returns template list with _count', async () => {
    const templates = [
      { id: 't1', name: '硬件模板', description: '硬件项目', _count: { activities: 5 } },
      { id: 't2', name: '软件模板', description: '软件项目', _count: { activities: 3 } },
    ];
    mockPrisma.projectTemplate.findMany.mockResolvedValue(templates);

    const res = await request(app).get('/api/templates');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('硬件模板');
    expect(res.body[0]._count.activities).toBe(5);
    expect(res.body[1]._count.activities).toBe(3);
    expect(mockPrisma.projectTemplate.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { activities: true } } },
    });
  });

  it('returns 500 on database error', async () => {
    mockPrisma.projectTemplate.findMany.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/templates');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('GET /api/templates/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it('returns template with activities', async () => {
    const template = {
      id: 't1',
      name: '硬件模板',
      description: '硬件项目模板',
      activities: [
        { id: 'ta1', name: '需求分析', type: 'TASK', sortOrder: 0 },
        { id: 'ta2', name: '方案设计', type: 'TASK', sortOrder: 1 },
      ],
    };
    mockPrisma.projectTemplate.findUnique.mockResolvedValue(template);

    const res = await request(app).get('/api/templates/t1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('硬件模板');
    expect(res.body.activities).toHaveLength(2);
    expect(res.body.activities[0].name).toBe('需求分析');
    expect(mockPrisma.projectTemplate.findUnique).toHaveBeenCalledWith({
      where: { id: 't1' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('returns 404 when template not found', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/templates/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('模板不存在');
  });

  it('returns 500 on database error', async () => {
    mockPrisma.projectTemplate.findUnique.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).get('/api/templates/t1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('POST /api/templates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it('creates template successfully', async () => {
    const created = {
      id: 't-new',
      name: '新模板',
      description: '测试模板',
      activities: [
        { id: 'ta1', name: '活动1', type: 'TASK', sortOrder: 0 },
      ],
    };
    mockPrisma.projectTemplate.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/templates')
      .send({
        name: '新模板',
        description: '测试模板',
        activities: [{ id: 'ta1', name: '活动1', type: 'TASK', sortOrder: 0 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('新模板');
    expect(res.body.activities).toHaveLength(1);
    expect(mockPrisma.projectTemplate.create).toHaveBeenCalledTimes(1);
  });

  it('creates template without activities', async () => {
    const created = { id: 't-new', name: '空模板', description: null };
    mockPrisma.projectTemplate.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/templates')
      .send({ name: '空模板' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('空模板');
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ description: '没有名称' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('模板名称不能为空');
    expect(mockPrisma.projectTemplate.create).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.projectTemplate.create.mockRejectedValue(new Error('DB fail'));

    const res = await request(app)
      .post('/api/templates')
      .send({ name: '出错模板' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('PUT /api/templates/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it('updates template and activities in transaction', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValueOnce({
      id: 't1',
      name: '旧名称',
    });

    const updatedTemplate = {
      id: 't1',
      name: '新名称',
      description: '更新描述',
      activities: [
        { id: 'ta-new', name: '新活动', type: 'TASK', sortOrder: 0 },
      ],
    };

    // The $transaction mock calls the callback with mockPrisma as tx
    mockPrisma.projectTemplate.update.mockResolvedValue({});
    mockPrisma.templateActivity.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.templateActivity.createMany.mockResolvedValue({ count: 1 });
    // findUnique called inside transaction to return final result
    mockPrisma.projectTemplate.findUnique.mockResolvedValueOnce(updatedTemplate);

    const res = await request(app)
      .put('/api/templates/t1')
      .send({
        name: '新名称',
        description: '更新描述',
        activities: [{ id: 'ta-new', name: '新活动', type: 'TASK', sortOrder: 0 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('新名称');
    expect(res.body.activities).toHaveLength(1);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.templateActivity.deleteMany).toHaveBeenCalledWith({
      where: { templateId: 't1' },
    });
    expect(mockPrisma.templateActivity.createMany).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when template not found', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/templates/nonexistent')
      .send({ name: '新名称' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('模板不存在');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('updates template without replacing activities when activities not provided', async () => {
    mockPrisma.projectTemplate.findUnique
      .mockResolvedValueOnce({ id: 't1', name: '旧名称' })
      .mockResolvedValueOnce({ id: 't1', name: '仅改名', activities: [] });

    mockPrisma.projectTemplate.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/templates/t1')
      .send({ name: '仅改名' });

    expect(res.status).toBe(200);
    expect(mockPrisma.templateActivity.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.templateActivity.createMany).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue({ id: 't1' });
    mockPrisma.$transaction.mockRejectedValue(new Error('TX fail'));

    const res = await request(app)
      .put('/api/templates/t1')
      .send({ name: '出错' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('DELETE /api/templates/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it('deletes template successfully', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue({ id: 't1', name: '待删除' });
    mockPrisma.projectTemplate.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/templates/t1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.projectTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
  });

  it('returns 404 when template not found', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/templates/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('模板不存在');
    expect(mockPrisma.projectTemplate.delete).not.toHaveBeenCalled();
  });

  it('returns 500 on database error', async () => {
    mockPrisma.projectTemplate.findUnique.mockResolvedValue({ id: 't1' });
    mockPrisma.projectTemplate.delete.mockRejectedValue(new Error('DB fail'));

    const res = await request(app).delete('/api/templates/t1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('服务器内部错误');
  });
});

describe('POST /api/templates/:id/copy (not yet implemented)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);
  });

  it.todo('copies template with "(副本)" suffix');
});

describe('Non-admin permission checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(false);
  });

  it('non-admin gets 403 on POST /api/templates', async () => {
    const res = await request(app)
      .post('/api/templates')
      .send({ name: '新模板' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('仅管理员可创建模板');
    expect(mockPrisma.projectTemplate.create).not.toHaveBeenCalled();
  });

  it('non-admin gets 403 on PUT /api/templates/:id', async () => {
    const res = await request(app)
      .put('/api/templates/t1')
      .send({ name: '改名' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('仅管理员可更新模板');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('non-admin gets 403 on DELETE /api/templates/:id', async () => {
    const res = await request(app).delete('/api/templates/t1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('仅管理员可删除模板');
    expect(mockPrisma.projectTemplate.delete).not.toHaveBeenCalled();
  });

  it('non-admin can still GET /api/templates (read-only)', async () => {
    mockPrisma.projectTemplate.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/templates');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('non-admin can still GET /api/templates/:id (read-only)', async () => {
    const template = { id: 't1', name: '模板', activities: [] };
    mockPrisma.projectTemplate.findUnique.mockResolvedValue(template);

    const res = await request(app).get('/api/templates/t1');

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('模板');
  });
});
