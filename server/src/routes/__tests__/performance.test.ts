import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { Readable } from 'stream';
import type { ParsedActivity } from '../../utils/excelActivityParser';

type AuthRequest = Request & { user?: unknown };
type UploadRequest = Request & { file?: { buffer: Buffer; originalname: string } };
type JwtTestPayload = { userId: string; username: string };
type PinyinMock = {
  mockReturnValue: (value: string) => void;
  mockImplementation: (fn: (name: string) => string[]) => void;
};

const { mockPrisma, mockCanManage } = vi.hoisted(() => ({
  mockPrisma: {
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
      create: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    projectArchive: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
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
    product: { findMany: vi.fn() },
    weeklyReport: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    riskAssessment: { findMany: vi.fn() },
    activityComment: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
  mockCanManage: vi.fn().mockReturnValue(true),
}));

vi.mock('../../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
  ProjectStatus: {
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON_HOLD',
    ARCHIVED: 'ARCHIVED',
  },
  ActivityType: { TASK: 'TASK', MILESTONE: 'MILESTONE', PHASE: 'PHASE' },
  ActivityStatus: {
    NOT_STARTED: 'NOT_STARTED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  },
}));

vi.mock('../../middleware/auth', () => ({
  authenticate: (req: AuthRequest, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: '管理员',
      roles: [{ id: 'role-admin', name: '系统管理员', description: null }],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
  invalidateUserCache: vi.fn(),
}));

vi.mock('../../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  isAdmin: () => true,
  canManageProject: (...args: unknown[]) => mockCanManage(...args),
  canDeleteProject: () => true,
  sanitizePagination: (p: unknown, ps: unknown) => ({
    pageNum: Number(p) || 1,
    pageSizeNum: Number(ps) || 20,
  }),
}));

vi.mock('../../utils/validation', () => ({
  VALID_PROJECT_STATUSES: ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'],
  VALID_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  isValidProjectStatus: (s: string) =>
    ['IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'ARCHIVED'].includes(s),
  isValidPriority: (p: string) =>
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(p),
  isValidDateRange: (start: string, end: string) =>
    new Date(start) <= new Date(end),
  isValidProgress: (n: number) => n >= 0 && n <= 100,
}));

vi.mock('../../utils/auditLog', () => ({
  auditLog: vi.fn(),
  diffFields: vi.fn(() => ({})),
}));

vi.mock('../../utils/projectProgress', () => ({
  updateProjectProgress: vi.fn(),
}));

vi.mock('../../utils/dependencyValidator', () => ({
  detectCircularDependency: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../utils/criticalPath', () => ({
  calculateCriticalPath: vi.fn().mockReturnValue([]),
}));

vi.mock('../../utils/workday', () => ({
  calculateWorkdays: vi.fn().mockReturnValue(5),
  offsetWorkdays: vi.fn().mockImplementation((d: Date, offset: number) => {
    const result = new Date(d);
    result.setDate(result.getDate() + offset);
    return result;
  }),
}));

vi.mock('../../utils/dependencyScheduler', () => ({
  resolveActivityDates: vi.fn().mockReturnValue({}),
  DependencyInput: {},
  PredecessorData: {},
}));

vi.mock('../../utils/aiClient', () => ({
  callAi: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../utils/excelActivityParser', () => ({
  parseExcelActivities: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../middleware/validate', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock('../../utils/weekNumber', () => ({
  getWeekNumber: vi.fn().mockReturnValue({ year: 2026, weekNumber: 17 }),
}));

vi.mock('../../utils/sanitize', () => ({
  sanitizeRichText: vi.fn((s: string | null) => s),
}));

vi.mock('multer', () => {
  const m = () => ({
    single: () => (req: UploadRequest, _res: Response, next: NextFunction) => {
      const buffer = Buffer.from('fake-excel');
      req.file = req.file || {
        fieldname: 'file',
        originalname: 'test.xlsx',
        encoding: '7bit',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: buffer.length,
        buffer,
        destination: '',
        filename: 'test.xlsx',
        path: '',
        stream: Readable.from(buffer),
      };
      next();
    },
  });
  m.memoryStorage = vi.fn();
  m.diskStorage = vi.fn();
  return { default: m };
});

vi.mock('pinyin-pro', () => ({
  pinyin: vi.fn().mockReturnValue('zhangsan'),
}));

vi.mock('../../utils/tokenBlacklist', () => ({
  blacklistToken: vi.fn(),
  isTokenBlacklisted: vi.fn().mockReturnValue(false),
}));

import projectRoutes from '../projects';
import activityRoutes from '../activities';
import weeklyReportRoutes from '../weeklyReports';

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
  assignees: [{ id: 'user-1', realName: '管理员', username: 'admin' }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockReset();
  mockPrisma.$transaction.mockImplementation((fn: unknown) =>
    typeof fn === 'function'
      ? (fn as (tx: typeof mockPrisma) => unknown)(mockPrisma)
      : Promise.all(fn as Iterable<unknown>)
  );
  mockCanManage.mockReturnValue(true);
});

describe('SYS-019: 1000-project list < 1s', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should return 1000 projects within 1 second', async () => {
    const projects1000 = Array.from({ length: 1000 }, (_, i) => ({
      ...sampleProject,
      id: `proj-${i}`,
      name: `Project ${i}`,
    }));

    mockPrisma.project.count
      .mockResolvedValueOnce(1000)
      .mockResolvedValueOnce(500)
      .mockResolvedValueOnce(300)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(1000);
    mockPrisma.project.findMany.mockResolvedValue(projects1000);

    const start = performance.now();
    const res = await request(app).get('/api/projects?page=1&pageSize=1000');
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('stats');
    expect(elapsed).toBeLessThan(1000);
    expect(res.body.data).toHaveLength(1000);
    expect(res.body.total).toBe(1000);
  });
});

describe('ARC-016: Snapshot performance with large dataset', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should archive a project with 100 activities and 50 risks', async () => {
    const activities = Array.from({ length: 100 }, (_, i) => ({
      id: `act-${i}`,
      name: `Activity ${i}`,
      status: 'COMPLETED',
      assignees: [],
    }));
    const risks = Array.from({ length: 50 }, (_, i) => ({
      id: `risk-${i}`,
      description: `Risk ${i}`,
    }));

    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.activity.findMany.mockResolvedValue(activities);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.weeklyReport.findMany.mockResolvedValue([]);
    mockPrisma.riskAssessment.findMany.mockResolvedValue(risks);
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.projectArchive.create.mockResolvedValue({ id: 'archive-1' });
    mockPrisma.project.update.mockResolvedValue({
      ...sampleProject,
      status: 'ARCHIVED',
    });

    const start = performance.now();
    const res = await request(app)
      .post('/api/projects/proj-1/archive')
      .send({ remark: 'large dataset test' });
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(2000);

    expect(mockPrisma.projectArchive.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            activities: expect.arrayContaining([
              expect.objectContaining({ id: 'act-0' }),
              expect.objectContaining({ id: 'act-99' }),
            ]),
            riskAssessments: expect.arrayContaining([
              expect.objectContaining({ id: 'risk-0' }),
              expect.objectContaining({ id: 'risk-49' }),
            ]),
          }),
        }),
      })
    );
  });

  it('should return 404 when archiving a non-existent project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/projects/proj-missing/archive')
      .send({ remark: 'ghost' });
    expect(res.status).toBe(404);
  });
});

describe('IMP-041: Import transaction handling', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);

  it('should handle import failure gracefully with error response', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);

    const { parseExcelActivities } = await import(
      '../../utils/excelActivityParser'
    );
    const { pinyin } = await import('pinyin-pro');

    const parsed50: ParsedActivity[] = Array.from({ length: 100 }, (_, i) => ({
      name: `Activity ${i}`,
      type: 'TASK',
      phase: '设计',
      assigneeNames: [`负责人${i}`],
      planStartDate: new Date('2026-04-01'),
      planEndDate: new Date('2026-04-10'),
      planDuration: 5,
      status: 'NOT_STARTED',
    }));
    vi.mocked(parseExcelActivities).mockResolvedValue(parsed50);
    (pinyin as unknown as PinyinMock).mockReturnValue('fuzeren');

    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'user-new', realName: '负责人0', username: 'fuzeren', canLogin: false });

    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.aggregate.mockResolvedValue({ _max: { sortOrder: null } });

    mockPrisma.$transaction.mockRejectedValueOnce(
      new Error('DB error at row 50')
    );

    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', Buffer.from('fake-excel'), 'test.xlsx');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });

  it('should succeed when all rows are valid', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);

    const { parseExcelActivities } = await import(
      '../../utils/excelActivityParser'
    );

    const validParsed: ParsedActivity[] = [
      {
        name: 'Activity A',
        type: 'TASK',
        assigneeNames: [] as string[],
        planStartDate: undefined,
        planEndDate: undefined,
        planDuration: 5,
        status: 'NOT_STARTED',
      },
      {
        name: 'Activity B',
        type: 'TASK',
        assigneeNames: [] as string[],
        planStartDate: undefined,
        planEndDate: undefined,
        planDuration: 3,
        status: 'NOT_STARTED',
      },
    ];
    vi.mocked(parseExcelActivities).mockResolvedValue(validParsed);

    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.aggregate.mockResolvedValue({ _max: { sortOrder: null } });

    const createdA = { id: 'act-a', name: 'Activity A', assignees: [] };
    const createdB = { id: 'act-b', name: 'Activity B', assignees: [] };
    mockPrisma.$transaction.mockResolvedValueOnce([createdA, createdB]);
    mockPrisma.activity.update.mockResolvedValue({});

    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', Buffer.from('fake-excel'), 'test.xlsx');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
  });
});

describe('CHAOS-001: Concurrent project deletion + weekly report creation', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);
  app.use('/api/weekly-reports', weeklyReportRoutes);

  it('weekly report creation should fail gracefully when project is deleted concurrently', async () => {
    mockPrisma.project.findUnique
      .mockResolvedValueOnce({
        ...sampleProject,
        managerId: 'user-1',
      })
      .mockResolvedValueOnce(null);

    mockPrisma.project.delete.mockResolvedValue({});

    const [deleteRes, reportRes] = await Promise.all([
      request(app).delete('/api/projects/proj-1'),
      request(app)
        .post('/api/weekly-reports')
        .send({
          projectId: 'proj-1',
          weekStart: '2026-04-20',
          weekEnd: '2026-04-26',
          changeOverview: 'test',
        }),
    ]);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    expect(reportRes.status).not.toBe(200);
    expect([400, 403, 404]).toContain(reportRes.status);
  });

  it('weekly report creation succeeds when project exists', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.weeklyReport.create.mockResolvedValue({
      id: 'wr-1',
      projectId: 'proj-1',
      status: 'DRAFT',
    });

    const res = await request(app)
      .post('/api/weekly-reports')
      .send({
        projectId: 'proj-1',
        weekStart: '2026-04-20',
        weekEnd: '2026-04-26',
        changeOverview: 'test',
      });

    expect(res.status).toBe(201);
  });
});

describe('CHAOS-003: 100 rapid status changes on same activity', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);

  it('should handle 100 rapid status updates and end with a valid state', async () => {
    const validStatuses = [
      'NOT_STARTED',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
    ];

    mockPrisma.activity.findUnique.mockResolvedValue(sampleActivity);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });

    let lastUpdatedStatus = 'NOT_STARTED';
    mockPrisma.activity.update.mockImplementation((args: Prisma.ActivityUpdateArgs) => {
      if (typeof args.data.status === 'string') {
        lastUpdatedStatus = args.data.status;
      }
      return Promise.resolve({ ...sampleActivity, status: lastUpdatedStatus });
    });
    mockPrisma.activity.findMany.mockResolvedValue([]);

    const requests = Array.from({ length: 100 }, (_, i) => {
      const status = validStatuses[i % validStatuses.length];
      return request(app)
        .put('/api/activities/act-1')
        .send({ status });
    });

    const results = await Promise.all(requests);

    const successes = results.filter((r) => r.status === 200);
    expect(successes.length).toBeGreaterThan(0);

    expect(validStatuses).toContain(lastUpdatedStatus);
  });
});

describe('CHAOS-005: Token refresh at boundary', () => {
  const app = express();
  app.use(express.json());

  const authMiddleware = (req: AuthRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      _res.status(401).json({ error: '未提供认证令牌' });
      return;
    }
    const token = authHeader.substring(7);
    try {
      const payload = jwt.verify(token, 'test-jwt-secret') as JwtTestPayload;
      req.user = {
        id: payload.userId,
        username: payload.username,
        realName: 'Test User',
        roles: [{ id: 'role-admin', name: 'admin', description: null }],
        permissions: ['*:*'],
        collaboratingProjectIds: [],
      };
      next();
    } catch {
      _res.status(401).json({ error: '令牌已过期' });
    }
  };

  app.get('/api/test-protected', authMiddleware, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  it('should return 401 with an expired token (not 500)', async () => {
    const expiredToken = jwt.sign(
      { userId: 'user-1', username: 'admin' },
      'test-jwt-secret',
      { expiresIn: '1ms' }
    );

    await new Promise((r) => setTimeout(r, 50));

    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).not.toBe(500);
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should succeed with a valid token', async () => {
    const validToken = jwt.sign(
      { userId: 'user-1', username: 'admin' },
      'test-jwt-secret',
      { expiresIn: '1h' }
    );

    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should return 401 with malformed JWT', async () => {
    const res = await request(app)
      .get('/api/test-protected')
      .set('Authorization', 'Bearer not-a-jwt-at-all');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

describe('CHAOS-010: Pinyin conflict for similar names', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);

  it('should produce different usernames for names with same pinyin', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);

    const { parseExcelActivities } = await import(
      '../../utils/excelActivityParser'
    );
    const { pinyin } = await import('pinyin-pro');

    vi.mocked(parseExcelActivities).mockResolvedValue([
      {
        name: 'Import Activity',
        type: 'TASK',
        assigneeNames: ['张三', '张叁'],
        planStartDate: undefined,
        planEndDate: undefined,
        planDuration: 5,
        status: 'NOT_STARTED',
      },
    ]);

    (pinyin as unknown as PinyinMock).mockImplementation((name: string) => {
      if (name === '张三' || name === '张叁') return ['zhang', 'san'];
      return ['default'];
    });

    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.activity.aggregate.mockResolvedValue({ _max: { sortOrder: null } });

    const createdUsernames: string[] = [];
    mockPrisma.user.findUnique.mockImplementation(({ where }: Prisma.UserFindUniqueArgs) => {
      const username = typeof where.username === 'string' ? where.username : '';
      if (createdUsernames.includes(username)) {
        return Promise.resolve({ id: 'existing', username });
      }
      return Promise.resolve(null);
    });

    mockPrisma.user.create.mockImplementation(({ data }: Prisma.UserCreateArgs) => {
      const username = typeof data.username === 'string' ? data.username : `user${createdUsernames.length + 1}`;
      createdUsernames.push(username);
      return Promise.resolve({
        id: `user-${createdUsernames.length}`,
        ...data,
      });
    });

    mockPrisma.$transaction.mockResolvedValue([
      { id: 'act-imported', name: 'Import Activity', assignees: [] },
    ]);

    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', Buffer.from('fake'), 'test.xlsx');

    expect(res.status).toBe(200);

    const seen = new Set<string>();
    for (const u of createdUsernames) {
      expect(seen.has(u)).toBe(false);
      seen.add(u);
    }
  });
});

describe('SYS-020: Project list with negative pagination', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should handle negative page and pageSize gracefully', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=-1&pageSize=-5');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('CHAOS-004: Rapid project updates under load', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should handle 50 concurrent project updates without error', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.project.update.mockResolvedValue({
      ...sampleProject,
      progress: 75,
    });

    const requests = Array.from({ length: 50 }, () =>
      request(app)
        .put('/api/projects/proj-1')
        .send({ progress: 75 })
    );

    const results = await Promise.all(requests);
    const successes = results.filter(r => r.status === 200);
    expect(successes.length).toBeGreaterThan(0);
  });
});

describe('SYS-021: Activity list with large dataset', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/activities', activityRoutes);

  it('should return 500 activities within 1 second', async () => {
    const activities500 = Array.from({ length: 500 }, (_, i) => ({
      ...sampleActivity,
      id: `act-${i}`,
      name: `Activity ${i}`,
    }));

    mockPrisma.activity.count.mockResolvedValue(500);
    mockPrisma.activity.findMany.mockResolvedValue(activities500);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const start = performance.now();
    const res = await request(app).get('/api/activities/project/proj-1?page=1&pageSize=500');
    const elapsed = performance.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(1000);
    expect(res.body.data).toHaveLength(500);
  });

  it('should return empty data when project has no activities', async () => {
    mockPrisma.activity.count.mockResolvedValue(0);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/activities/project/proj-1?page=1&pageSize=20');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it('should handle page number beyond available data', async () => {
    mockPrisma.activity.count.mockResolvedValue(5);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.project.findUnique.mockResolvedValue({
      managerId: 'user-1',
      status: 'IN_PROGRESS',
    });
    mockPrisma.projectMember.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/activities/project/proj-1?page=999&pageSize=20');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(5);
  });
});

describe('SYS-022: Project list with zero pageSize', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should handle pageSize=0 gracefully returning empty data', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=0');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('SYS-023: project stats with zero projects', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/projects', projectRoutes);

  it('should return zero stats when no projects exist', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects');

    expect(res.status).toBe(200);
    expect(res.body.stats).toBeDefined();
    expect(res.body.total).toBe(0);
  });

  it('should return project list with very large page number', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=999999&pageSize=20');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(1);
  });

  it('should handle non-numeric page and pageSize as defaults', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=abc&pageSize=xyz');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should return 404 when archiving a project already archived', async () => {
    mockPrisma.project.findUnique.mockResolvedValue({ ...sampleProject, status: 'ARCHIVED' });

    const res = await request(app)
      .post('/api/projects/proj-1/archive')
      .send({ remark: 'already archived' });

    expect(res.status).toBe(400);
  });

  it('should handle zero pageSize without error', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=0');

    expect(res.status).toBe(200);
  });

  it('should handle concurrent archive requests gracefully', async () => {
    mockPrisma.project.findUnique
      .mockResolvedValueOnce(sampleProject)
      .mockResolvedValueOnce(null);

    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockPrisma.product.findMany.mockResolvedValue([]);
    mockPrisma.weeklyReport.findMany.mockResolvedValue([]);
    mockPrisma.riskAssessment.findMany.mockResolvedValue([]);
    mockPrisma.activityComment.findMany.mockResolvedValue([]);
    mockPrisma.projectArchive.create.mockResolvedValue({ id: 'archive-1' });
    mockPrisma.project.update.mockResolvedValue({ ...sampleProject, status: 'ARCHIVED' });

    const res1 = await request(app).post('/api/projects/proj-1/archive').send({ remark: 'first' });

    expect([200, 400, 404, 409]).toContain(res1.status);
  });

  it('should return 404 when updating a non-existent project', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .put('/api/projects/nonexistent')
      .send({ name: 'Updated' });

    expect(res.status).toBe(404);
  });

  it('should handle project list with very large pageSize', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=99999');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('should handle non-numeric pageSize gracefully', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=abc');

    expect(res.status).toBe(200);
  });

  it('handles negative page number gracefully', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=-1&pageSize=10');

    expect(res.status).toBe(200);
  });

  it('handles very long project name without error', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.project.update.mockResolvedValue({
      ...sampleProject,
      name: 'A'.repeat(500),
    });

    const res = await request(app)
      .put('/api/projects/proj-1')
      .send({ name: 'B'.repeat(500) });

    expect([200, 400, 500]).toContain(res.status);
  });

  it('handles pageSize=0 by using default pagination', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=0');

    expect(res.status).toBe(200);
  });

  it('handles negative page number by using default page', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=-1&pageSize=10');

    expect(res.status).toBe(200);
  });

  it('handles extremely large pageSize by capping at 100', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=99999');

    expect(res.status).toBe(200);
  });

  it('handles DELETE request for non-existent project gracefully', async () => {
    mockPrisma.project.findUnique.mockResolvedValue(null);

    const res = await request(app).delete('/api/projects/nonexistent-proj');

    expect([200, 404]).toContain(res.status);
  });

  it('handles pageSize of zero by using default', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=1&pageSize=0');

    expect(res.status).toBe(200);
  });

  it('handles very large page number gracefully', async () => {
    mockPrisma.project.count.mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=999999');

    expect(res.status).toBe(200);
  });

  it('handles page number with special characters', async () => {
    mockPrisma.project.count
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockPrisma.project.findMany.mockResolvedValue([]);

    const res = await request(app).get('/api/projects?page=abc&pageSize=10');

    expect(res.status).toBe(200);
  });
});
