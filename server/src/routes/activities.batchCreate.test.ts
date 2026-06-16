import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../generated/prisma/client';

// ─── Hoisted mocks（沿用 activities.test.ts 的成熟 mock 集，确保整路由可加载）─────
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
  // 默认 true = 通过 items[0] 的 canManageProject（让流程走到越权点）
  mockCanManage: vi.fn().mockReturnValue(true),
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
  ActivityType: { TASK: 'TASK', MILESTONE: 'MILESTONE', PHASE: 'PHASE' },
  ActivityStatus: { NOT_STARTED: 'NOT_STARTED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', CANCELLED: 'CANCELLED' },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: 'manager-A', username: 'mgrA', realName: '经理A', roles: [], permissions: ['activity:create'], collaboratingProjectIds: ['A'] };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  canManageProject: (...args: unknown[]) => mockCanManage(...args),
  sanitizePagination: (p: unknown, ps: unknown) => ({ pageNum: Number(p) || 1, pageSizeNum: Number(ps) || 20 }),
}));

vi.mock('../utils/auditLog', () => ({ auditLog: vi.fn(), diffFields: vi.fn(() => ({})) }));
vi.mock('../utils/projectProgress', () => ({ updateProjectProgress: vi.fn() }));
vi.mock('../utils/dependencyValidator', () => ({ detectCircularDependency: vi.fn().mockResolvedValue(false) }));
vi.mock('../utils/criticalPath', () => ({ calculateCriticalPath: vi.fn().mockReturnValue(['act-1']) }));
vi.mock('../utils/workday', () => ({
  calculateWorkdays: vi.fn().mockReturnValue(5),
  offsetWorkdays: vi.fn().mockImplementation((d: Date, offset: number) => { const r = new Date(d); r.setDate(r.getDate() + offset); return r; }),
}));
vi.mock('../utils/dependencyScheduler', () => ({ resolveActivityDates: vi.fn(), DependencyInput: {}, PredecessorData: {} }));
vi.mock('../utils/aiClient', () => ({ callAi: vi.fn().mockResolvedValue(null) }));
vi.mock('../utils/excelActivityParser', () => ({ parseExcelActivities: vi.fn().mockResolvedValue([]) }));
vi.mock('../middleware/validate', () => ({ validate: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('multer', () => { const m = () => ({ single: () => (_req: Request, _res: Response, next: NextFunction) => next() }); m.memoryStorage = vi.fn(); m.diskStorage = vi.fn(); return { default: m }; });
vi.mock('pinyin-pro', () => ({ pinyin: vi.fn().mockReturnValue('zhangsan') }));
vi.mock('../utils/roleMembershipResolver', () => ({
  autoAssignByRole: vi.fn().mockResolvedValue(['user-1', 'user-2']),
  resolveRoleMembers: vi.fn().mockResolvedValue([]),
  findRolesByUser: vi.fn().mockResolvedValue([]),
  findActiveActivitiesByExecutor: vi.fn().mockResolvedValue([]),
}));

import activityRoutes from './activities';

const app = express();
app.use(express.json());
app.use('/api/activities', activityRoutes);

beforeEach(() => {
  vi.clearAllMocks();
  // 默认让 items[0] 的 canManageProject 通过（用户「是 A 的经理」），以暴露越权点
  mockCanManage.mockReturnValue(true);
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'A', managerId: 'manager-A', status: 'IN_PROGRESS' });
  mockPrisma.activity.create.mockImplementation((args: { data: { projectId: string; name: string } }) => ({
    id: `new-${args.data.projectId}`,
    ...args.data,
  }));
});

describe('POST /api/activities/batch-create — 跨项目越权', () => {
  // ── BUG: batch-create 只校验 items[0].projectId，其余条目用各自 projectId 写库 ──
  // crud.ts:156-176：canManageProject 仅对 items[0] 调用一次，$transaction 里每条用 item.projectId 创建。
  // 对比 batch-update（crud.ts:323）/ batch-delete（crud.ts:602）都强制 `projectIds.length !== 1 → 400`。
  // 经理 A 提交 [{projectId:A},{projectId:B}]：A 校验通过，B 被静默创建（B 可能是他人/归档项目）。
  it('BUG: batch-create 仅校验 items[0] 的项目，可跨项目写入未授权项目', async () => {
    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'A', name: 'A 的活动' },
          { projectId: 'B', name: 'B 的活动（越权）' },
        ],
      });

    const createdProjectIds = mockPrisma.activity.create.mock.calls.map(
      (c: [{ data: { projectId: string } }]) => c[0].data.projectId
    );

    // 期望（修复后）：跨项目批量应被拒（400/403），且绝不写入用户无权操作的 B
    expect([400, 403]).toContain(res.status);
    expect(createdProjectIds).not.toContain('B');
  });

  it('单项目批量且为经理应放行（修复后回归保护）', async () => {
    const res = await request(app)
      .post('/api/activities/batch-create')
      .send({
        activities: [
          { projectId: 'A', name: 'a1' },
          { projectId: 'A', name: 'a2' },
        ],
      });

    expect(res.status).toBe(201);
    const createdProjectIds = mockPrisma.activity.create.mock.calls.map(
      (c: [{ data: { projectId: string } }]) => c[0].data.projectId
    );
    expect(createdProjectIds).toEqual(['A', 'A']);
  });
});
