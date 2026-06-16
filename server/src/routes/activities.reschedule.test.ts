import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';

// ─── Hoisted mocks ───────────────────────────────────────────────────────────
// canManageProject 默认返回 false =「非项目经理」。当前 reschedule 根本不调用它；
// 修复后应调用 → false → 403，本用例自然转绿。
const { mockPrisma, mockCanManage, mockUser } = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    activity: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  mockCanManage: vi.fn().mockReturnValue(false),
  mockUser: {
    current: {
      id: 'stranger',
      username: 'stranger',
      realName: '局外人',
      roles: [],
      permissions: ['activity:read'],
      collaboratingProjectIds: [] as string[],
    },
  },
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = mockUser.current;
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  canManageProject: (...args: unknown[]) => mockCanManage(...args),
  sanitizePagination: (p: unknown, ps: unknown) => ({ pageNum: Number(p) || 1, pageSizeNum: Number(ps) || 20 }),
}));

// 隔离 schedule.ts 的直接依赖，避免加载 crud/analysis/import 及真实 db
vi.mock('./activities/shared', () => ({
  prisma: mockPrisma,
  dependenciesFromJson: (d: unknown) => d,
}));
vi.mock('../utils/projectProgress', () => ({ updateProjectProgress: vi.fn() }));
vi.mock('../utils/auditLog', () => ({ auditLog: vi.fn(), diffFields: vi.fn(() => ({})) }));
vi.mock('../utils/aiClient', () => ({ callAi: vi.fn() }));
vi.mock('../utils/criticalPath', () => ({ calculateCriticalPath: vi.fn() }));
vi.mock('../utils/dependencyScheduler', () => ({
  resolveActivityDates: vi.fn(),
  DependencyInput: {},
  PredecessorData: {},
}));
vi.mock('../utils/workday', () => ({
  calculateWorkdays: vi.fn().mockReturnValue(5),
  offsetWorkdays: vi.fn().mockImplementation((d: Date, offset: number) => {
    const r = new Date(d);
    r.setDate(r.getDate() + offset);
    return r;
  }),
}));

import { scheduleRouter } from './activities/schedule';

const app = express();
app.use(express.json());
app.use('/api/activities', scheduleRouter);

beforeEach(() => {
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(false); // 局外人非项目经理
  // 修复后 reschedule 会先查 managerId 再过 canManageProject
  mockPrisma.project.findUnique.mockResolvedValue({ id: 'p1', managerId: 'owner-1', status: 'IN_PROGRESS' });
  mockPrisma.activity.findMany.mockResolvedValue([
    {
      id: 'a1',
      name: '硬件打样',
      status: 'NOT_STARTED',
      dependencies: [],
      planStartDate: null,
      planEndDate: null,
      planDuration: 5,
      startDate: null,
      endDate: null,
      duration: null,
    },
  ]);
  mockPrisma.activity.update.mockResolvedValue({});
  mockPrisma.$transaction.mockResolvedValue([]);
});

describe('POST /api/activities/project/:projectId/reschedule — authz', () => {
  // ── BUG: 一键重排只有 authenticate，无 requirePermission / canManageProject / 归档校验 ──
  // 对比同文件 POST /project/:projectId/what-if/apply（schedule.ts:385）有完整的
  // requirePermission('activity','update') + canManageProject 门控；reschedule（schedule.ts:163）全缺。
  // 任意已登录用户可重写任意项目（含他人项目、归档项目）的全部未完成活动排期。
  it('BUG: 非项目经理可一键重排任意项目排期（reschedule 缺 canManageProject 校验）', async () => {
    const res = await request(app)
      .post('/api/activities/project/p1/reschedule')
      .send({ baseDate: '2026-01-05' });

    // 期望（修复后）：非项目经理 → 403，且不触碰写库
    expect(res.status).toBe(403);
    expect(mockCanManage).toHaveBeenCalledWith(expect.anything(), 'owner-1', 'p1');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('经理重排自己的项目应放行（修复后回归保护）', async () => {
    mockCanManage.mockReturnValue(true);
    const res = await request(app)
      .post('/api/activities/project/p1/reschedule')
      .send({ baseDate: '2026-01-05' });

    expect(res.status).toBe(200);
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });
});
