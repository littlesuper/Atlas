import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────

const { mockPrisma, mockCanManage } = vi.hoisted(() => ({
  mockPrisma: {
    activity: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    activityExecutor: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    roleMember: {
      findMany: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) =>
      typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn)
    ),
  },
  mockCanManage: vi.fn().mockReturnValue(true),
}));

// ─── vi.mock calls ────────────────────────────────────────────────────────────

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as any;
    }
  },
  ActivityType: { TASK: 'TASK', MILESTONE: 'MILESTONE', PHASE: 'PHASE' },
  ActivityStatus: {
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
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
  canManageProject: (...args: any[]) => mockCanManage(...args),
  sanitizePagination: (p: any, ps: any) => ({
    pageNum: Number(p) || 1,
    pageSizeNum: Number(ps) || 20,
  }),
}));

vi.mock('../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(() => ({})),
}));
vi.mock('../utils/projectProgress', () => ({
  updateProjectProgress: vi.fn(),
}));
vi.mock('../utils/dependencyValidator', () => ({
  detectCircularDependency: vi.fn().mockResolvedValue(false),
}));
vi.mock('../utils/criticalPath', () => ({
  calculateCriticalPath: vi.fn().mockReturnValue(['act-1']),
}));
vi.mock('../utils/workday', () => ({
  calculateWorkdays: vi.fn().mockReturnValue(5),
  offsetWorkdays: vi.fn().mockImplementation((d: Date, offset: number) => {
    const result = new Date(d);
    result.setDate(result.getDate() + offset);
    return result;
  }),
}));
vi.mock('../utils/dependencyScheduler', () => ({
  resolveActivityDates: vi.fn().mockReturnValue({}),
  DependencyInput: {},
  PredecessorData: {},
}));
vi.mock('../utils/aiClient', () => ({
  callAi: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/excelActivityParser', () => ({
  parseExcelActivities: vi.fn().mockReturnValue([]),
}));
vi.mock('../middleware/validate', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('multer', () => {
  const m = () => ({
    single: () => (_req: any, _res: any, next: any) => next(),
  });
  m.memoryStorage = vi.fn();
  m.diskStorage = vi.fn();
  return { default: m };
});
vi.mock('pinyin-pro', () => ({
  pinyin: vi.fn().mockReturnValue('zhangsan'),
}));
vi.mock('../utils/roleMembershipResolver', () => ({
  autoAssignByRole: vi.fn().mockResolvedValue(['user-1', 'user-2']),
  resolveRoleMembers: vi.fn().mockResolvedValue([]),
  findRolesByUser: vi.fn().mockResolvedValue([]),
  findActiveActivitiesByExecutor: vi.fn().mockResolvedValue([]),
}));

// ─── App setup ────────────────────────────────────────────────────────────────

import activityRoutes from './activities';

const app = express();
app.use(express.json());
app.use('/api/activities', activityRoutes);

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sampleProject = {
  id: 'proj-1',
  name: '测试项目',
  managerId: 'user-1',
  status: 'IN_PROGRESS',
  productLine: '产品线A',
};

const sampleActivity = {
  id: 'act-1',
  projectId: 'proj-1',
  name: '测试活动',
  description: '描述',
  type: 'TASK',
  phase: '设计',
  status: 'NOT_STARTED',
  priority: 'MEDIUM',
  planStartDate: new Date('2026-04-01'),
  planEndDate: new Date('2026-04-10'),
  planDuration: 5,
  startDate: null,
  endDate: null,
  duration: null,
  dependencies: null,
  notes: null,
  sortOrder: 1,
  executors: [],
  _count: { checkItems: 2 },
  checkItems: [
    { id: 'ci-1', checked: true },
    { id: 'ci-2', checked: false },
  ],
};

const sampleActivity2 = {
  ...sampleActivity,
  id: 'act-2',
  name: '测试活动2',
  sortOrder: 2,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(true);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activities/project/:projectId — 获取项目活动列表
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activities/project/:projectId', () => {
  it('should return tree-mode activity list when no pagination params', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([sampleActivity, sampleActivity2]);

    const res = await request(app).get('/api/activities/project/proj-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe('测试活动');
  });

  it('should return paginated list when page/pageSize provided', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([sampleActivity]);
    mockPrisma.activity.count.mockResolvedValue(10);

    const res = await request(app)
      .get('/api/activities/project/proj-1')
      .query({ page: '1', pageSize: '5' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total', 10);
    expect(res.body).toHaveProperty('page', 1);
    expect(res.body).toHaveProperty('pageSize', 5);
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/activities/project/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should use default pagination when only page is provided', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.count.mockResolvedValue(0);

    const res = await request(app)
      .get('/api/activities/project/proj-1')
      .query({ page: '2' });

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(20);
  });

  it('should handle empty activity list', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/activities/project/proj-1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activities/project/:projectId/gantt — 甘特图数据
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activities/project/:projectId/gantt', () => {
  it('should return gantt tasks and links', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const actWithDeps = {
      ...sampleActivity,
      dependencies: [{ id: 'act-0', type: '0' }],
    };
    mockPrisma.activity.findMany.mockResolvedValue([actWithDeps]);

    const res = await request(app).get('/api/activities/project/proj-1/gantt');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tasks');
    expect(res.body).toHaveProperty('links');
    expect(res.body.tasks).toHaveLength(1);
    expect(res.body.tasks[0].text).toBe('测试活动');
    expect(res.body.links).toHaveLength(1);
    expect(res.body.links[0].source).toBe('act-0');
    expect(res.body.links[0].target).toBe('act-1');
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).get('/api/activities/project/nonexistent/gantt');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should map MILESTONE type to milestone', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const milestone = { ...sampleActivity, type: 'MILESTONE', dependencies: null };
    mockPrisma.activity.findMany.mockResolvedValue([milestone]);

    const res = await request(app).get('/api/activities/project/proj-1/gantt');

    expect(res.status).toBe(200);
    expect(res.body.tasks[0].type).toBe('milestone');
  });

  it('should map PHASE type to project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const phase = { ...sampleActivity, type: 'PHASE', dependencies: null };
    mockPrisma.activity.findMany.mockResolvedValue([phase]);

    const res = await request(app).get('/api/activities/project/proj-1/gantt');

    expect(res.status).toBe(200);
    expect(res.body.tasks[0].type).toBe('project');
  });

  it('should return empty links when activities have no dependencies', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([
      { ...sampleActivity, dependencies: null },
    ]);

    const res = await request(app).get('/api/activities/project/proj-1/gantt');

    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activities/project/:projectId/critical-path
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activities/project/:projectId/critical-path', () => {
  it('should return critical activity IDs', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([sampleActivity]);

    const res = await request(app).get(
      '/api/activities/project/proj-1/critical-path'
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('criticalActivityIds');
    expect(res.body.criticalActivityIds).toContain('act-1');
  });

  it('should return empty array when no activities', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);
    const { calculateCriticalPath } = await import('../utils/criticalPath');
    (calculateCriticalPath as any).mockReturnValue([]);

    const res = await request(app).get(
      '/api/activities/project/proj-1/critical-path'
    );

    expect(res.status).toBe(200);
    expect(res.body.criticalActivityIds).toEqual([]);
  });

  it('should pass activities to calculateCriticalPath', async () => {
    const acts = [sampleActivity, sampleActivity2];
    mockPrisma.activity.findMany.mockResolvedValue(acts);

    await request(app).get('/api/activities/project/proj-1/critical-path');

    const { calculateCriticalPath } = await import('../utils/criticalPath');
    expect(calculateCriticalPath).toHaveBeenCalledWith(acts);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activities/workload — 资源负载看板
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activities/workload', () => {
  const workloadActivity = {
    id: 'act-w1',
    name: '负载活动',
    status: 'IN_PROGRESS',
    planStartDate: new Date('2026-03-01'),
    planEndDate: new Date('2026-03-10'),
    planDuration: 8,
    executors: [{ userId: 'user-1', user: { id: 'user-1', realName: '管理员', username: 'admin' } }],
    project: { id: 'proj-1', name: '测试项目' },
  };

  it('should return summary, members, and issues', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([workloadActivity]);

    const res = await request(app).get('/api/activities/workload');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('summary');
    expect(res.body).toHaveProperty('members');
    expect(res.body).toHaveProperty('issues');
    expect(res.body.summary).toHaveProperty('totalOverdue');
    expect(res.body.summary).toHaveProperty('totalUnassigned');
    expect(res.body.summary).toHaveProperty('overloadedCount');
  });

  it('should filter by projectId query parameter', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/activities/workload')
      .query({ projectId: 'proj-1' });

    expect(res.status).toBe(200);
    expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'proj-1' }),
      })
    );
  });

  it('should detect overdue activities', async () => {
    const overdueActivity = {
      ...workloadActivity,
      status: 'IN_PROGRESS',
      planEndDate: new Date('2020-01-01'), // past date => overdue
    };
    mockPrisma.activity.findMany.mockResolvedValue([overdueActivity]);

    const res = await request(app).get('/api/activities/workload');

    expect(res.status).toBe(200);
    expect(res.body.summary.totalOverdue).toBe(1);
    expect(res.body.issues.length).toBeGreaterThanOrEqual(1);
    expect(res.body.issues[0].type).toBe('overdue');
  });

  it('should detect unassigned activities', async () => {
    const unassigned = {
      ...workloadActivity,
      status: 'NOT_STARTED',
      executors: [],
    };
    mockPrisma.activity.findMany.mockResolvedValue([unassigned]);

    const res = await request(app).get('/api/activities/workload');

    expect(res.status).toBe(200);
    expect(res.body.summary.totalUnassigned).toBe(1);
  });

  it('should return empty results when no activities', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/activities/workload');

    expect(res.status).toBe(200);
    expect(res.body.members).toEqual([]);
    expect(res.body.issues).toEqual([]);
    expect(res.body.summary.totalOverdue).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/activities/resource-conflicts — 资源冲突检测
// ═══════════════════════════════════════════════════════════════════════════════

describe('GET /api/activities/resource-conflicts', () => {
  it('should return empty array when no conflicts', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/activities/resource-conflicts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should detect conflicts when same person has overlapping activities', async () => {
    const user = { id: 'user-1', realName: '管理员', username: 'admin' };
    const a1 = {
      id: 'act-c1',
      name: '活动A',
      projectId: 'proj-1',
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 8,
      executors: [{ user }],
      project: { id: 'proj-1', name: '项目1' },
    };
    const a2 = {
      id: 'act-c2',
      name: '活动B',
      projectId: 'proj-1',
      planStartDate: new Date('2026-04-05'),
      planEndDate: new Date('2026-04-15'),
      planDuration: 8,
      executors: [{ user }],
      project: { id: 'proj-1', name: '项目1' },
    };
    mockPrisma.activity.findMany.mockResolvedValue([a1, a2]);

    const res = await request(app).get('/api/activities/resource-conflicts');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].userId).toBe('user-1');
    expect(res.body[0].activities).toHaveLength(2);
  });

  it('should filter by projectId query parameter', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/activities/resource-conflicts')
      .query({ projectId: 'proj-1' });

    expect(res.status).toBe(200);
    expect(mockPrisma.activity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'proj-1' }),
      })
    );
  });

  it('should not report conflicts when activities do not overlap', async () => {
    const user = { id: 'user-1', realName: '管理员', username: 'admin' };
    const a1 = {
      id: 'act-c1',
      name: '活动A',
      projectId: 'proj-1',
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-05'),
      planDuration: 4,
      executors: [{ user }],
      project: { id: 'proj-1', name: '项目1' },
    };
    const a2 = {
      id: 'act-c2',
      name: '活动B',
      projectId: 'proj-1',
      planStartDate: new Date('2026-04-10'),
      planEndDate: new Date('2026-04-15'),
      planDuration: 4,
      executors: [{ user }],
      project: { id: 'proj-1', name: '项目1' },
    };
    mockPrisma.activity.findMany.mockResolvedValue([a1, a2]);

    const res = await request(app).get('/api/activities/resource-conflicts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('should ignore activities with only one assignee and no overlap', async () => {
    const singleAct = {
      id: 'act-single',
      name: '单人活动',
      projectId: 'proj-1',
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 8,
      executors: [{ user: { id: 'user-solo', realName: '独行侠', username: 'solo' } }],
      project: { id: 'proj-1', name: '项目1' },
    };
    mockPrisma.activity.findMany.mockResolvedValue([singleAct]);

    const res = await request(app).get('/api/activities/resource-conflicts');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities — 创建活动
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities', () => {
  it('should create an activity successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue(sampleActivity);

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '测试活动',
      type: 'TASK',
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('测试活动');
    expect(mockPrisma.activity.create).toHaveBeenCalled();
  });

  it('should return 403 when project is archived', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({
      ...sampleProject,
      status: 'ARCHIVED',
    });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '测试活动',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('归档项目不可修改');
  });

  it('should return 400 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/activities').send({
      projectId: 'nonexistent',
      name: '测试活动',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should return 400 when circular dependency is detected', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const { detectCircularDependency } = await import(
      '../utils/dependencyValidator'
    );
    (detectCircularDependency as any).mockResolvedValue(true);

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '测试活动',
      dependencies: [{ id: 'act-2', type: '0' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('存在循环依赖，无法保存');

    // Reset mock
    (detectCircularDependency as any).mockResolvedValue(false);
  });

  it('should return 403 when user cannot manage project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockCanManage.mockReturnValue(false);

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '测试活动',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('只能在自己负责的项目中创建活动');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/batch-create — 批量创建活动
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/batch-create', () => {
  it('should batch create activities successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    const created1 = { ...sampleActivity, id: 'act-new-1' };
    const created2 = { ...sampleActivity, id: 'act-new-2' };
    mockPrisma.activity.create.mockResolvedValueOnce(created1);
    mockPrisma.activity.create.mockResolvedValueOnce(created2);
    mockPrisma.$transaction.mockResolvedValue([created1, created2]);

    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'proj-1', name: '活动1' },
          { projectId: 'proj-1', name: '活动2' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it('should return 400 when activities array is empty', async () => {
    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({ activities: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请提供活动数据');
  });

  it('should return 400 when activities is not provided', async () => {
    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请提供活动数据');
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [{ projectId: 'nonexistent', name: '活动1' }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/project/:projectId/what-if — What-if 模拟
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/project/:projectId/what-if', () => {
  it('should simulate delay and return affected activities', async () => {
    const act = {
      id: 'act-1',
      name: '活动1',
      dependencies: null,
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 5,
    };
    mockPrisma.activity.findMany.mockResolvedValue([act]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if')
      .send({ activityId: 'act-1', delayDays: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('affectedCount');
    expect(res.body).toHaveProperty('affected');
    expect(res.body).toHaveProperty('projectEndDateBefore');
    expect(res.body).toHaveProperty('projectEndDateAfter');
    expect(res.body.affectedCount).toBeGreaterThanOrEqual(1);
  });

  it('should return 400 when activityId or delayDays is missing', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不能为空');
  });

  it('should return 400 when delayDays is zero', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if')
      .send({ activityId: 'act-1', delayDays: 0 });

    expect(res.status).toBe(400);
  });

  it('should return 404 when activity not found in project', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      {
        id: 'act-other',
        name: '其他活动',
        dependencies: null,
        planStartDate: new Date('2026-04-01'),
        planEndDate: new Date('2026-04-10'),
        planDuration: 5,
      },
    ]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if')
      .send({ activityId: 'act-missing', delayDays: 3 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('活动不存在');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/project/:projectId/what-if/apply — 应用 What-if 结果
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/project/:projectId/what-if/apply', () => {
  it('should apply what-if results successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.update.mockResolvedValue(sampleActivity);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if/apply')
      .send({
        affected: [
          { id: 'act-1', newStart: '2026-04-05', newEnd: '2026-04-15' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedCount).toBe(1);
  });

  it('should return 400 when affected array is empty', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if/apply')
      .send({ affected: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('受影响活动列表不能为空');
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if/apply')
      .send({
        affected: [{ id: 'act-1', newStart: '2026-04-05', newEnd: '2026-04-15' }],
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should return 403 when user cannot manage project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockCanManage.mockReturnValue(false);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if/apply')
      .send({
        affected: [{ id: 'act-1', newStart: '2026-04-05', newEnd: '2026-04-15' }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('无权操作');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/project/:projectId/reschedule — 一键重排
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/project/:projectId/reschedule', () => {
  it('should reschedule incomplete activities', async () => {
    const incompleteAct = {
      id: 'act-r1',
      name: '未完成活动',
      status: 'NOT_STARTED',
      dependencies: [],
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 5,
      startDate: null,
      endDate: null,
      duration: null,
    };
    mockPrisma.activity.findMany.mockResolvedValue([incompleteAct]);
    mockPrisma.activity.update.mockResolvedValue(incompleteAct);
    mockPrisma.$transaction.mockResolvedValue([incompleteAct]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/reschedule')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedCount).toBeGreaterThanOrEqual(1);
  });

  it('should return 0 updated when all activities are completed', async () => {
    const completedAct = {
      id: 'act-r2',
      name: '已完成活动',
      status: 'COMPLETED',
      dependencies: null,
      planStartDate: new Date('2026-03-01'),
      planEndDate: new Date('2026-03-10'),
      planDuration: 5,
      startDate: null,
      endDate: null,
      duration: null,
    };
    mockPrisma.activity.findMany.mockResolvedValue([completedAct]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/reschedule')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedCount).toBe(0);
  });

  it('should accept optional baseDate parameter', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/reschedule')
      .send({ baseDate: '2026-05-01' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/project/:projectId/ai-schedule — AI 排计划
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/project/:projectId/ai-schedule', () => {
  it('should return rule-based suggestions when AI returns null', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([
      {
        id: 'act-ai1',
        name: '设计',
        type: 'TASK',
        phase: '设计',
        planDuration: 5,
        status: 'NOT_STARTED',
      },
    ]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/ai-schedule')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('suggestions');
    expect(res.body).toHaveProperty('risks');
    expect(res.body).toHaveProperty('summary');
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activities/project/nonexistent/ai-schedule')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should parse AI JSON response when available', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const { callAi } = await import('../utils/aiClient');
    (callAi as any).mockResolvedValue({
      content: JSON.stringify({
        suggestions: [{ name: 'A', suggestedDuration: 10, reason: '建议' }],
        risks: [],
        summary: 'AI总结',
      }),
    });

    const res = await request(app)
      .post('/api/activities/project/proj-1/ai-schedule')
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe('AI总结');

    // Reset
    (callAi as any).mockResolvedValue(null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/activities/project/:projectId/undo-import — 撤销导入
// ═══════════════════════════════════════════════════════════════════════════════

describe('POST /api/activities/project/:projectId/undo-import', () => {
  it('should undo import by deleting activities', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.deleteMany.mockResolvedValue({ count: 3 });

    const res = await request(app)
      .post('/api/activities/project/proj-1/undo-import')
      .send({ ids: ['act-1', 'act-2', 'act-3'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(3);
    expect(mockPrisma.activity.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['act-1', 'act-2', 'act-3'] }, projectId: 'proj-1' },
    });
  });

  it('should return 400 when ids array is empty', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/undo-import')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无可撤销的活动');
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/activities/project/proj-1/undo-import')
      .send({ ids: ['act-1'] });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should return 403 when user cannot manage project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockCanManage.mockReturnValue(false);

    const res = await request(app)
      .post('/api/activities/project/proj-1/undo-import')
      .send({ ids: ['act-1'] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('无权操作');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/activities/:id — 更新活动
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/activities/:id', () => {
  it('should update an activity successfully', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });
    const updated = { ...sampleActivity, name: '更新后的活动' };
    mockPrisma.activity.update.mockResolvedValue(updated);
    // For cascadeUpdateDependents
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app)
      .put('/api/activities/act-1')
      .send({ name: '更新后的活动' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('更新后的活动');
  });

  it('should return 404 when activity does not exist', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/activities/nonexistent')
      .send({ name: '不存在' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('活动不存在');
  });

  it('should return 403 when project is archived', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'ARCHIVED',
    });

    const res = await request(app)
      .put('/api/activities/act-1')
      .send({ name: '更新' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('归档项目不可修改');
  });

  it('should return 403 when user cannot manage project', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'other-user',
      status: 'IN_PROGRESS',
    });
    mockCanManage.mockReturnValue(false);

    const res = await request(app)
      .put('/api/activities/act-1')
      .send({ name: '更新' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('只能修改自己负责的项目中的活动');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/activities/batch-update — 批量更新
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/activities/batch-update', () => {
  it('should batch update activities successfully', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-1' },
    ]);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
    });
    mockPrisma.activity.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({
        ids: ['act-1', 'act-2'],
        updates: { status: 'IN_PROGRESS' },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it('should return 400 when ids array is empty', async () => {
    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({ ids: [], updates: { status: 'IN_PROGRESS' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请选择活动');
  });

  it('should return 400 when activities belong to different projects', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-2' },
    ]);

    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({
        ids: ['act-1', 'act-2'],
        updates: { status: 'IN_PROGRESS' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('批量操作仅支持同一项目的活动');
  });
});

// ==================== Activity Role Binding Tests ====================

describe('Activity Role Binding: POST /api/activities with roleId', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('auto-fills executors when roleId provided without executorIds', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: 'PCB 打样',
      roleId: 'r1',
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.activity.create.mock.calls[0][0];
    expect(createCall.data.roleId).toBe('r1');
    expect(createCall.data.executors.create).toBeDefined();
    expect(createCall.data.executors.create.length).toBeGreaterThan(0);
    expect(createCall.data.executors.create[0].source).toBe('ROLE_AUTO');
    expect(createCall.data.executors.create[0].snapshotRoleId).toBe('r1');
  });

  it('uses provided executorIds when both roleId and executorIds given', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: 'PCB 打样',
      roleId: 'r1',
      executorIds: ['user-1'],
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.activity.create.mock.calls[0][0];
    expect(createCall.data.executors.create).toHaveLength(1);
    expect(createCall.data.executors.create[0].userId).toBe('user-1');
    expect(createCall.data.executors.create[0].source).toBe('ROLE_AUTO');
  });

  it('marks non-role members as MANUAL_ADD', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: 'PCB 打样',
      roleId: 'r1',
      executorIds: ['user-1', 'user-3'],
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.activity.create.mock.calls[0][0];
    const sources = createCall.data.executors.create.map((e: any) => e.source);
    expect(sources).toContain('MANUAL_ADD');
  });

  it('creates activity with null roleId and executorIds as MANUAL_ADD', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue({ ...sampleActivity, roleId: null, executors: [] });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '协调会议',
      roleId: null,
      executorIds: ['user-1'],
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.activity.create.mock.calls[0][0];
    expect(createCall.data.roleId).toBeNull();
    expect(createCall.data.executors.create[0].source).toBe('MANUAL_ADD');
    expect(createCall.data.executors.create[0].snapshotRoleId).toBeNull();
  });

  it('allows empty roleId with empty executorIds', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.create.mockResolvedValue({ ...sampleActivity, roleId: null, executors: [] });

    const res = await request(app).post('/api/activities').send({
      projectId: 'proj-1',
      name: '协调会议',
      roleId: null,
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.activity.create.mock.calls[0][0];
    expect(createCall.data.executors.create).toHaveLength(0);
  });
});

describe('Activity Role Binding: PUT /api/activities/:id', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('updates roleId without resetting executors', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ ...sampleActivity, roleId: null });
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.update.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).put('/api/activities/act-1').send({
      roleId: 'r1',
    });

    expect(res.status).toBe(200);
    const updateCall = mockPrisma.activity.update.mock.calls[0][0];
    expect(updateCall.data.roleId).toBe('r1');
    expect(updateCall.data.executors).toBeUndefined();
  });

  it('resets executors when resetExecutorsByRole=true', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ ...sampleActivity, roleId: 'r1' });
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activityExecutor.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.activity.update.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).put('/api/activities/act-1').send({
      resetExecutorsByRole: true,
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.activityExecutor.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 'act-1' },
    });
    const updateCall = mockPrisma.activity.update.mock.calls[0][0];
    expect(updateCall.data.executors.create).toBeDefined();
    expect(updateCall.data.executors.create[0].source).toBe('ROLE_AUTO');
  });

  it('replaces executors when executorIds provided', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ ...sampleActivity, roleId: 'r1' });
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activityExecutor.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.activity.update.mockResolvedValue({ ...sampleActivity, roleId: 'r1', executors: [] });

    const res = await request(app).put('/api/activities/act-1').send({
      executorIds: ['user-2'],
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.activityExecutor.deleteMany).toHaveBeenCalled();
    const updateCall = mockPrisma.activity.update.mock.calls[0][0];
    expect(updateCall.data.executors.create).toHaveLength(1);
    expect(updateCall.data.executors.create[0].userId).toBe('user-2');
  });

  it('blocks update for archived project', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue({ ...sampleActivity });
    mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, status: 'ARCHIVED' });

    const res = await request(app).put('/api/activities/act-1').send({
      roleId: 'r1',
      executorIds: ['user-1'],
    });

    expect(res.status).toBe(403);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUT /api/activities/project/:projectId/reorder — 批量排序
// ═══════════════════════════════════════════════════════════════════════════════

describe('PUT /api/activities/project/:projectId/reorder', () => {
  it('should reorder activities successfully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/activities/project/proj-1/reorder')
      .send({
        items: [
          { id: 'act-1', sortOrder: 2 },
          { id: 'act-2', sortOrder: 1 },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/activities/project/nonexistent/reorder')
      .send({ items: [{ id: 'act-1', sortOrder: 1 }] });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('项目不存在');
  });

  it('should return 400 when items is not an array', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);

    const res = await request(app)
      .put('/api/activities/project/proj-1/reorder')
      .send({ items: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的排序数据');
  });

  it('should return 403 when user cannot manage project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockCanManage.mockReturnValue(false);

    const res = await request(app)
      .put('/api/activities/project/proj-1/reorder')
      .send({ items: [{ id: 'act-1', sortOrder: 1 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('只能对自己负责的项目中的活动排序');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/activities/:id — 删除活动
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/activities/:id', () => {
  it('should delete an activity successfully', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });
    mockPrisma.activity.delete.mockResolvedValue(sampleActivity);

    const res = await request(app).delete('/api/activities/act-1');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockPrisma.activity.delete).toHaveBeenCalledWith({
      where: { id: 'act-1' },
    });
  });

  it('should return 404 when activity does not exist', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/activities/nonexistent');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('活动不存在');
  });

  it('should return 403 when project is archived', async () => {
    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'ARCHIVED',
    });

    const res = await request(app).delete('/api/activities/act-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('归档项目不可修改');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/activities/batch-delete — 批量删除
// ═══════════════════════════════════════════════════════════════════════════════

describe('DELETE /api/activities/batch-delete', () => {
  it('should batch delete activities successfully', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-1' },
    ]);
    mockPrisma.project.findUnique.mockResolvedValue({ managerId: 'user-1' });
    mockPrisma.activity.deleteMany.mockResolvedValue({ count: 2 });

    const res = await request(app)
      .delete('/api/activities/batch-delete')
      .send({ ids: ['act-1', 'act-2'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });

  it('should return 400 when ids array is empty', async () => {
    const res = await request(app)
      .delete('/api/activities/batch-delete')
      .send({ ids: [] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('请选择活动');
  });

  it('should return 400 when activities belong to different projects', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-2' },
    ]);

    const res = await request(app)
      .delete('/api/activities/batch-delete')
      .send({ ids: ['act-1', 'act-2'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('批量操作仅支持同一项目的活动');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P0: ACT-015 parent delete cascades children
// ═══════════════════════════════════════════════════════════════════════════════

describe('ACT-015: parent activity delete cascades children', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ACT-015 deleting parent activity also deletes child activities', async () => {
    const parentId = 'parent-act';
    mockPrisma.activity.findUnique.mockResolvedValue({
      id: parentId,
      projectId: 'proj-1',
      parentId: null,
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', managerId: 'user-1' });

    // Prisma onDelete: Cascade handles children
    mockPrisma.activity.delete.mockResolvedValue({ id: parentId });

    const res = await request(app)
      .delete(`/api/activities/${parentId}`);

    expect(res.status).toBe(200);
    expect(mockPrisma.activity.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: parentId } })
    );
  });
});

describe('ACT-006/007: planDuration bounds', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-006 planDuration=0 is accepted (no backend validation)', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS', managerId: 'user-1' });
    mockPrisma.activity.findUnique.mockResolvedValue(null);
    mockPrisma.activity.create.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activity.count.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/activities')
      .send({ projectId: 'proj-1', name: 'Zero Duration', type: 'TASK', planDuration: 0 });

    expect(res.status).toBe(201);
  });

  it('ACT-007 planDuration=9999 is accepted (no backend validation)', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS', managerId: 'user-1' });
    mockPrisma.activity.findUnique.mockResolvedValue(null);
    mockPrisma.activity.create.mockResolvedValue({ id: 'act-1' });
    mockPrisma.activity.count.mockResolvedValue(0);

    const res = await request(app)
      .post('/api/activities')
      .send({ projectId: 'proj-1', name: 'Huge Duration', type: 'TASK', planDuration: 9999 });

    expect(res.status).toBe(201);
  });
});

describe('ACT-017: activity name search (no keyword filter)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-017 GET /project/:id returns all activities (no keyword param)', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1' });
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.count.mockResolvedValue(0);
    mockPrisma.activity.aggregate.mockResolvedValue({ _sum: { planDuration: 0 } });

    const res = await request(app).get('/api/activities/project/proj-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.activity.findMany).toHaveBeenCalled();
  });
});

describe('ACT-012: dependency on non-existent activity', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-012 create with non-existent dependency activity creates anyway (no backend FK check)', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'proj-1', status: 'IN_PROGRESS', managerId: 'user-1' });
    mockPrisma.activity.create.mockResolvedValue({
      ...sampleActivity,
      id: 'act-new',
      dependencies: [{ id: 'nonexistent-act', type: '0' }],
    });

    const res = await request(app)
      .post('/api/activities')
      .send({
        projectId: 'proj-1',
        name: '活动with无效依赖',
        type: 'TASK',
        dependencies: [{ id: 'nonexistent-act', type: '0' }],
      });

    // No FK validation on dependency IDs; activity is created
    expect(res.status).toBe(201);
  });
});

describe('ACT-014: 5-level nested tree structure', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-014 tree mode returns flat list with parentId references', async () => {
    const l0 = { ...sampleActivity, id: 'l0', parentId: null, name: 'Level 0' };
    const l1 = { ...sampleActivity, id: 'l1', parentId: 'l0', name: 'Level 1' };
    const l2 = { ...sampleActivity, id: 'l2', parentId: 'l1', name: 'Level 2' };
    const l3 = { ...sampleActivity, id: 'l3', parentId: 'l2', name: 'Level 3' };
    const l4 = { ...sampleActivity, id: 'l4', parentId: 'l3', name: 'Level 4' };
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue([l0, l1, l2, l3, l4]);

    const res = await request(app).get('/api/activities/project/proj-1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body.find((a: any) => a.id === 'l4').parentId).toBe('l3');
    expect(res.body.find((a: any) => a.id === 'l3').parentId).toBe('l2');
    expect(res.body.find((a: any) => a.id === 'l2').parentId).toBe('l1');
    expect(res.body.find((a: any) => a.id === 'l1').parentId).toBe('l0');
    expect(res.body.find((a: any) => a.id === 'l0').parentId).toBeNull();
  });
});

describe('ACT-023: What-If with negative delayDays (advance)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-023 negative delayDays simulates advancing dates', async () => {
    const act = {
      id: 'act-1',
      name: '活动1',
      dependencies: null,
      planStartDate: new Date('2026-04-10'),
      planEndDate: new Date('2026-04-20'),
      planDuration: 5,
    };
    mockPrisma.activity.findMany.mockResolvedValue([act]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/what-if')
      .send({ activityId: 'act-1', delayDays: -5 });

    expect(res.status).toBe(200);
    expect(res.body.affectedCount).toBeGreaterThanOrEqual(1);
    // The new start should be earlier than original
    const affected0 = res.body.affected[0];
    expect(new Date(affected0.newStart).getTime()).toBeLessThan(new Date(affected0.originalStart).getTime());
  });
});

describe('ACT-040: cross-project batch update returns 400', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('ACT-040 batch update with activities from different projects returns 400', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-2' },
    ]);

    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({
        ids: ['act-1', 'act-2'],
        updates: { status: 'IN_PROGRESS' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('批量操作仅支持同一项目的活动');
  });
});

describe('Week 4 Batch 4: activity batch operation side-effect guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanManage.mockReturnValue(true);
  });

  it('does not update anything when batch update ids match no activities', async () => {
    const { updateProjectProgress } = await import('../utils/projectProgress');
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({
        ids: ['missing-1', 'missing-2'],
        updates: { status: 'IN_PROGRESS' },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('批量操作仅支持同一项目的活动');
    expect(mockPrisma.project.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    expect(updateProjectProgress).not.toHaveBeenCalled();
  });

  it('clears and recreates executors for every activity in a batch assignee update', async () => {
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-1' },
    ]);
    mockPrisma.project.findUnique.mockResolvedValue({ managerId: 'user-1' });
    mockPrisma.activityExecutor.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.activity.update.mockResolvedValue({});

    const res = await request(app)
      .put('/api/activities/batch-update')
      .send({
        ids: ['act-1', 'act-2'],
        updates: { assigneeIds: ['user-2', 'user-3'] },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.activityExecutor.deleteMany).toHaveBeenCalledTimes(2);
    expect(mockPrisma.activityExecutor.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { activityId: 'act-1' },
    });
    expect(mockPrisma.activity.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'act-1' },
      data: {
        executors: {
          create: [
            { userId: 'user-2', source: 'MANUAL_ADD', assignedBy: 'user-1' },
            { userId: 'user-3', source: 'MANUAL_ADD', assignedBy: 'user-1' },
          ],
        },
      },
    });
    expect(mockPrisma.activity.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'act-2' },
      data: {
        executors: {
          create: [
            { userId: 'user-2', source: 'MANUAL_ADD', assignedBy: 'user-1' },
            { userId: 'user-3', source: 'MANUAL_ADD', assignedBy: 'user-1' },
          ],
        },
      },
    });
  });

  it('does not delete activities or update progress when batch delete permission is denied', async () => {
    const { updateProjectProgress } = await import('../utils/projectProgress');
    mockPrisma.activity.findMany.mockResolvedValue([
      { id: 'act-1', projectId: 'proj-1' },
      { id: 'act-2', projectId: 'proj-1' },
    ]);
    mockPrisma.project.findUnique.mockResolvedValue({ managerId: 'manager-1' });
    mockCanManage.mockReturnValue(false);

    const res = await request(app)
      .delete('/api/activities/batch-delete')
      .send({ ids: ['act-1', 'act-2'] });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('无权操作');
    expect(mockPrisma.activity.deleteMany).not.toHaveBeenCalled();
    expect(updateProjectProgress).not.toHaveBeenCalled();
  });

  it('does not reorder activities when reorder payload is invalid', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);

    const res = await request(app)
      .put('/api/activities/project/proj-1/reorder')
      .send({ items: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('无效的排序数据');
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
  });
});
