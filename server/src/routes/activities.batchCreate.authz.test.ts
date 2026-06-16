import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';

// 越权防护回归（GLM QA #86）：POST /api/activities/batch-create 原仅校验 items[0].projectId，
// 写库却用各 item.projectId → 经理可在自己项目里夹带他人/归档项目的活动（跨项目 IDOR）。
// 修复：批量必须同属一个 projectId（单项目约束），并对该项目做 canManageProject + 归档校验。
//
// 本文件刻意使用「真实」canManageProject（不 mock ../middleware/permission），用非管理员用户
// （id≠managerId、无 *:* 通配、无协作）实测 403；项目经理（id===managerId）实测放行。
// 注意：requirePermission 也走真实逻辑，故用户需带 activity:create/update 权限以越过权限门，
// 真正落到 canManageProject 的归属判断。

const { mockPrisma, mockUser } = vi.hoisted(() => ({
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
    activityExecutor: { deleteMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    roleMember: { findMany: vi.fn() },
    project: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn((fn: unknown) =>
      typeof fn === 'function'
        ? (fn as (client: typeof mockPrisma) => unknown)(mockPrisma)
        : Promise.all(fn as Promise<unknown>[])
    ),
  },
  mockUser: {
    // 默认：局外人（非经理、非协作、非管理员），但带 activity 写权限以越过 requirePermission。
    current: {
      id: 'stranger',
      username: 'stranger',
      realName: '局外人',
      roles: [] as Array<{ id: string; name: string; description: string | null }>,
      permissions: ['activity:create', 'activity:update'],
      collaboratingProjectIds: [] as string[],
    },
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as never;
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
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = mockUser.current;
    next();
  },
}));

// 注意：故意「不」mock ../middleware/permission —— 使用真实 requirePermission + canManageProject。

vi.mock('../utils/auditLog', () => ({ auditLog: vi.fn(), diffFields: vi.fn(() => ({})) }));
vi.mock('../utils/projectProgress', () => ({ updateProjectProgress: vi.fn() }));
vi.mock('../utils/dependencyValidator', () => ({ detectCircularDependency: vi.fn().mockResolvedValue(false) }));
vi.mock('../utils/criticalPath', () => ({ calculateCriticalPath: vi.fn().mockReturnValue(['act-1']) }));
vi.mock('../utils/workday', () => ({
  calculateWorkdays: vi.fn().mockReturnValue(5),
  offsetWorkdays: vi.fn().mockImplementation((d: Date, offset: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + offset);
    return r;
  }),
}));
vi.mock('../utils/dependencyScheduler', () => ({
  resolveActivityDates: vi.fn().mockReturnValue({}),
  DependencyInput: {},
  PredecessorData: {},
}));
vi.mock('../utils/aiClient', () => ({ callAi: vi.fn().mockResolvedValue(null) }));
vi.mock('../utils/excelActivityParser', () => ({ parseExcelActivities: vi.fn().mockReturnValue([]) }));
vi.mock('../middleware/validate', () => ({
  validate: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('multer', () => {
  const m = () => ({ single: () => (_req: Request, _res: Response, next: NextFunction) => next() });
  m.memoryStorage = vi.fn();
  m.diskStorage = vi.fn();
  return { default: m };
});
vi.mock('pinyin-pro', () => ({ pinyin: vi.fn().mockReturnValue('zhangsan') }));
vi.mock('../utils/roleMembershipResolver', () => ({
  autoAssignByRole: vi.fn().mockResolvedValue(['user-1', 'user-2']),
  resolveRoleMembers: vi.fn().mockResolvedValue([]),
  findRolesByUser: vi.fn().mockResolvedValue([]),
  findActiveActivitiesByExecutor: vi.fn().mockResolvedValue([]),
}));
vi.mock('../utils/metrics', () => ({ recordBusinessEvent: vi.fn() }));

import activityRoutes from './activities';

const app = express();
app.use(express.json());
app.use('/api/activities', activityRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.current = {
    id: 'stranger',
    username: 'stranger',
    realName: '局外人',
    roles: [],
    permissions: ['activity:create', 'activity:update'],
    collaboratingProjectIds: [],
  };
  // 项目经理是 owner-1；当前用户默认是 stranger（非经理）。
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'A', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.activity.create.mockImplementation((args: { data: { projectId: string; name: string } }) => ({
    id: `new-${args.data.projectId}`,
    ...args.data,
  }));
});

describe('POST /api/activities/batch-create — 越权防护 (IDOR #86)', () => {
  it('非项目经理（真实 canManageProject）单项目 batch-create → 403，且不写库', async () => {
    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'A', name: 'a1' },
          { projectId: 'A', name: 'a2' },
        ],
      });

    expect(res.status).toBe(403);
    expect(mockPrisma.activity.create).not.toHaveBeenCalled();
  });

  it('跨项目混合 item → 被拒（单项目约束），且绝不写入越权项目 B', async () => {
    // 即便当前用户是 A 的经理，夹带 B 也应被单项目约束拦下。
    mockUser.current = { ...mockUser.current, id: 'owner-1' };

    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'A', name: 'A 的活动' },
          { projectId: 'B', name: 'B 的活动（越权）' },
        ],
      });

    expect([400, 403]).toContain(res.status);
    const createdProjectIds = mockPrisma.activity.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { projectId: string } }).data.projectId
    );
    expect(createdProjectIds).not.toContain('B');
    // 单项目约束应在任何写入前短路。
    expect(mockPrisma.activity.create).not.toHaveBeenCalled();
  });

  it('归档项目即便是项目经理也不可批量创建 → 403，不写库', async () => {
    mockUser.current = { ...mockUser.current, id: 'owner-1' };
    mockPrisma.project.findUnique.mockResolvedValue({ id: 'A', managerId: 'owner-1', status: 'ARCHIVED' });

    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [{ projectId: 'A', name: 'a1' }],
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('归档项目不可修改');
    expect(mockPrisma.activity.create).not.toHaveBeenCalled();
  });

  it('项目经理（id===managerId）同项目 batch-create → 放行 (201)，全部写入该项目', async () => {
    mockUser.current = { ...mockUser.current, id: 'owner-1' };

    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'A', name: 'a1' },
          { projectId: 'A', name: 'a2' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(2);
    const createdProjectIds = mockPrisma.activity.create.mock.calls.map(
      (c: unknown[]) => (c[0] as { data: { projectId: string } }).data.projectId
    );
    expect(createdProjectIds).toEqual(['A', 'A']);
  });
});
