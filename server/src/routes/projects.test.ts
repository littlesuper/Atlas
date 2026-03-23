import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    projectArchive: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    activity: { findMany: vi.fn() },
    product: { findMany: vi.fn() },
    weeklyReport: { findMany: vi.fn() },
    riskAssessment: { findMany: vi.fn() },
    activityComment: { findMany: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(mockPrisma)),
  };
  return { mockPrisma };
});

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class { constructor() { return mockPrisma as any; } },
  ProjectStatus: {
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON_HOLD',
    ARCHIVED: 'ARCHIVED',
  },
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
  isAdmin: () => true,
  canManageProject: () => true,
  canDeleteProject: () => true,
  sanitizePagination: (page: any, pageSize: any) => ({
    pageNum: parseInt(page) || 1,
    pageSizeNum: parseInt(pageSize) || 20,
  }),
}));

vi.mock('../utils/validation', () => ({
  VALID_PROJECT_STATUSES: ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'],
  VALID_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  isValidProjectStatus: (s: string) => ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'].includes(s),
  isValidPriority: (p: string) => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p),
  isValidDateRange: (start: string, end: string) => new Date(start) <= new Date(end),
  isValidProgress: (n: number) => n >= 0 && n <= 100,
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import projectRoutes from './projects';

const app = express();
app.use(express.json());
app.use('/api/projects', projectRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sampleProject = {
  id: 'proj-1',
  name: 'Test Project',
  description: 'A test project',
  productLine: 'Router',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  startDate: '2026-01-01',
  endDate: '2026-06-01',
  progress: 50,
  managerId: 'user-1',
  manager: { id: 'user-1', realName: 'Admin', username: 'admin' },
  members: [],
  _count: { activities: 5, products: 2 },
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated project list with stats', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(10) // all
      .mockResolvedValueOnce(5)  // inProgress
      .mockResolvedValueOnce(3)  // completed
      .mockResolvedValueOnce(1)  // onHold
      .mockResolvedValueOnce(1)  // archived
      .mockResolvedValueOnce(10); // total for pagination
    mockPrisma.project.findMany.mockResolvedValue([sampleProject]);

    const res = await request(app).get('/api/projects?page=1&pageSize=10');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('stats');
    expect(res.body.stats).toHaveProperty('all');
    expect(res.body.stats).toHaveProperty('inProgress');
    expect(res.body.stats).toHaveProperty('completed');
    expect(res.body.data).toHaveLength(1);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.project.count.mockRejectedValue(new Error('DB down'));
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns project by id', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const res = await request(app).get('/api/projects/proj-1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name', 'Test Project');
  });

  it('returns 404 when project not found', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/projects/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/不存在/);
  });
});

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({ name: 'Test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/必填字段/);
  });

  it('returns 400 for invalid status', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test',
        productLine: 'Router',
        status: 'INVALID',
        priority: 'HIGH',
        managerId: 'user-1',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/状态值/);
  });

  it('returns 400 for invalid priority', async () => {
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test',
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'SUPER',
        managerId: 'user-1',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/优先级/);
  });

  it('returns 400 when end date is before start date', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test',
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        managerId: 'user-1',
        startDate: '2026-06-01',
        endDate: '2026-01-01',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/结束日期/);
  });

  it('returns 400 when manager does not exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test',
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        managerId: 'nonexistent',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/项目经理不存在/);
  });

  it('creates a project successfully', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.project.create.mockResolvedValue({
      ...sampleProject,
      id: 'new-proj',
    });

    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'New Project',
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        managerId: 'user-1',
        startDate: '2026-01-01',
        endDate: '2026-06-01',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1' });
    mockPrisma.project.create.mockRejectedValue(new Error('create fail'));

    const res = await request(app)
      .post('/api/projects')
      .send({
        name: 'Test',
        productLine: 'Router',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        managerId: 'user-1',
      });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/projects/nonexistent')
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/不存在/);
  });

  it('returns 403 when project is archived', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ...sampleProject,
      status: 'ARCHIVED',
    });
    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/归档/);
  });

  it('returns 400 for invalid progress value', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ progress: 150 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/进度/);
  });

  it('returns 400 when trying to set status to ARCHIVED via update', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ status: 'ARCHIVED' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/归档/);
  });

  it('returns 400 for invalid status', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ status: 'BOGUS' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/状态值/);
  });

  it('returns 400 when new manager does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ managerId: 'ghost' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/项目经理不存在/);
  });

  it('updates project successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.project.update.mockResolvedValue({
      ...sampleProject,
      name: 'Updated Project',
    });

    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ name: 'Updated Project' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Updated Project');
  });
});

describe('DELETE /api/projects/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/projects/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/不存在/);
  });

  it('deletes project successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, managerId: 'user-1' });
    mockPrisma.project.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/projects/proj-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns 500 on unexpected error', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, managerId: 'user-1' });
    mockPrisma.project.delete.mockRejectedValue(new Error('FK violation'));

    const res = await request(app).delete('/api/projects/proj-1');
    expect(res.status).toBe(500);
  });
});
