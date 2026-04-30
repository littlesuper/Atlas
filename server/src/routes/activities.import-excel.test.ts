import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { mockPrisma, mockCanManage } = vi.hoisted(() => ({
  mockPrisma: {
    project: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    role: {
      findMany: vi.fn(),
    },
    activity: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    activityExecutor: {
      createMany: vi.fn(),
    },
    importBatch: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => (typeof fn === 'function' ? fn(mockPrisma) : Promise.all(fn))),
  },
  mockCanManage: vi.fn().mockReturnValue(true),
}));

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
  calculateCriticalPath: vi.fn().mockReturnValue([]),
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
vi.mock('pinyin-pro', () => ({
  pinyin: vi.fn().mockReturnValue('zhangsan'),
}));
vi.mock('../utils/roleMembershipResolver', () => ({
  autoAssignByRole: vi.fn().mockResolvedValue(['user-1', 'user-2']),
  resolveRoleMembers: vi.fn().mockResolvedValue([]),
  findRolesByUser: vi.fn().mockResolvedValue([]),
  findActiveActivitiesByExecutor: vi.fn().mockResolvedValue([]),
}));
vi.mock('../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import activityRoutes from './activities';
import { parseExcelActivities } from '../utils/excelActivityParser';

const app = express();
app.use(express.json());
app.use('/api/activities', activityRoutes);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  res.status(500).json({ error: err.message });
});

const sampleProject = {
  id: 'proj-1',
  name: '测试项目',
  managerId: 'user-1',
  status: 'IN_PROGRESS',
};

const fakeXlsxUpload = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('fake-excel')]);

describe('POST /api/activities/project/:projectId/import-excel file validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.project.findUnique.mockResolvedValue(sampleProject);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.activity.findMany.mockResolvedValue([]);
    mockCanManage.mockReturnValue(true);
  });

  it('rejects legacy .xls uploads before parsing', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', fakeXlsxUpload, 'legacy.xls');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.xlsx');
    expect(parseExcelActivities).not.toHaveBeenCalled();
  });

  it('rejects non-zip content renamed to .xlsx before parsing', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', Buffer.from('not an xlsx file'), 'renamed.xlsx');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('.xlsx');
    expect(parseExcelActivities).not.toHaveBeenCalled();
  });

  it('allows .xlsx uploads with zip magic bytes to reach the parser', async () => {
    const res = await request(app)
      .post('/api/activities/project/proj-1/import-excel')
      .attach('file', fakeXlsxUpload, 'activities.xlsx');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, count: 0, skipped: 0 });
    expect(parseExcelActivities).toHaveBeenCalledOnce();
  });
});
