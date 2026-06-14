import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../generated/prisma/client';

// ─── Hoisted mocks ─────────────────────────────────────────
const {
  mockPrisma,
  mockCanManage,
  mockDetectCycle,
  mockAuditLog,
  mockUpdateProgress,
  mockParseUtterance,
  mockNarrate,
} = vi.hoisted(() => ({
  mockPrisma: {
    project: { findUnique: vi.fn() },
    activity: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : Promise.resolve(arg)
    ),
  },
  mockCanManage: vi.fn().mockReturnValue(true),
  mockDetectCycle: vi.fn().mockResolvedValue(false),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockUpdateProgress: vi.fn().mockResolvedValue(undefined),
  // 边缘服务在此 mock；它们各自的单测覆盖了 AI 调用细节
  mockParseUtterance: vi.fn(),
  mockNarrate: vi.fn().mockResolvedValue('AI 复述的预览'),
}));

vi.mock('../services/scheduleAssistantIntent', () => ({
  parseUtterance: mockParseUtterance,
}));
vi.mock('../services/scheduleAssistantNarrate', () => ({
  narrateProposal: mockNarrate,
}));

vi.mock('../db', () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

vi.mock('../generated/prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      return mockPrisma as unknown as PrismaClient;
    }
  },
  Prisma: {},
}));

vi.mock('../middleware/auth', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction) => {
    req.user = {
      id: 'user-1',
      username: 'admin',
      realName: '管理员',
      roles: [],
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  canManageProject: (...args: unknown[]) => mockCanManage(...args),
}));

vi.mock('../utils/dependencyValidator', () => ({
  detectCircularDependency: mockDetectCycle,
}));

vi.mock('../utils/projectProgress', () => ({ updateProjectProgress: mockUpdateProgress }));

vi.mock('../utils/auditLog', () => ({ auditLog: mockAuditLog, diffFields: vi.fn(() => ({})) }));

// ─── App / route under test ────────────────────────────────
import router from './scheduleAssistant';
import { proposeFromIntent, proposalCache } from '../services/scheduleAssistant';
import type { ScheduleChangeIntent } from '../schemas/scheduleAssistant';

const app = express();
app.use(express.json());
app.use('/api/schedule-assistant', router);

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const seedActivities = () => [
  {
    id: 'A1',
    name: '硬件打样',
    type: 'TASK',
    planStartDate: d('2026-03-02'),
    planEndDate: d('2026-03-06'),
    planDuration: 5,
    hardConstraintDate: null,
    dependencies: null,
    sortOrder: 0,
  },
  {
    id: 'A2',
    name: '固件联调',
    type: 'TASK',
    planStartDate: d('2026-03-09'),
    planEndDate: d('2026-03-13'),
    planDuration: 5,
    hardConstraintDate: null,
    dependencies: [{ id: 'A1', type: '0' }],
    sortOrder: 1,
  },
];

const baseProject = {
  id: 'project-1',
  managerId: 'user-1',
  status: 'IN_PROGRESS' as const,
  endDate: d('2026-12-31'),
};

beforeEach(() => {
  proposalCache.__reset();
  vi.clearAllMocks();
  mockCanManage.mockReturnValue(true);
  mockDetectCycle.mockResolvedValue(false);
  mockNarrate.mockResolvedValue('AI 复述的预览');
  mockPrisma.project.findUnique.mockResolvedValue(baseProject);
  mockPrisma.activity.findMany.mockResolvedValue(seedActivities());
  // 默认：意图解析成功，返回一个把 A1 推迟两周的意图
  mockParseUtterance.mockResolvedValue({
    status: 'ok',
    intent: intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
  });
});

const intent = (
  operations: ScheduleChangeIntent['operations']
): ScheduleChangeIntent => ({
  projectId: 'project-1',
  operations,
  confidence: 'high',
  unresolved: [],
});

// ═══════════════════════════════════════════════════════════
// POST /api/schedule-assistant/propose
// ═══════════════════════════════════════════════════════════
describe('POST /api/schedule-assistant/propose', () => {
  it('happy path: 200 with proposalId + diff + narrative when intent parses', async () => {
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: '把硬件打样推迟两周' });
    expect(res.status).toBe(200);
    expect(res.body.proposalId).toBeTruthy();
    expect(res.body.noOp).toBe(false);
    expect(res.body.diff.items.length).toBeGreaterThan(0);
    expect(res.body.narrative).toBe('AI 复述的预览');
  });

  it('returns 503 AI_UNAVAILABLE when intent parsing reports ai_unavailable', async () => {
    mockParseUtterance.mockResolvedValueOnce({ status: 'ai_unavailable' });
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: '把硬件打样推迟两周' });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_UNAVAILABLE');
  });

  it('returns 200 noOp "没听懂" when intent parsing reports not_understood', async () => {
    mockParseUtterance.mockResolvedValueOnce({ status: 'not_understood', reason: 'fabricated_id' });
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: '把幽灵活动推迟一周' });
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
    expect(res.body.proposalId).toBeNull();
    expect(res.body.narrative).toContain('没听懂');
  });

  it('still returns proposalId when narration fails (degrade to structured diff, 01 §G)', async () => {
    mockNarrate.mockRejectedValueOnce(new Error('AI 叙述不可用'));
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: '把硬件打样推迟两周' });
    expect(res.status).toBe(200);
    expect(res.body.proposalId).toBeTruthy();
    expect(res.body.narrative).toBe(''); // 无叙述但仍可应用
    expect(res.body.diff.items.length).toBeGreaterThan(0);
  });

  it('returns 404 when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'nope', utterance: 'x' });
    expect(res.status).toBe(404);
  });

  it('returns 403 when project is archived', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce({
      ...baseProject,
      status: 'ARCHIVED',
    });
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: 'x' });
    expect(res.status).toBe(403);
  });

  it('returns 403 when canManageProject is false', async () => {
    mockCanManage.mockReturnValueOnce(false);
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: 'x' });
    expect(res.status).toBe(403);
  });

  it('does NOT call AI when permission denied (no wasted LLM cost)', async () => {
    mockCanManage.mockReturnValueOnce(false);
    await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: 'x' });
    expect(mockParseUtterance).not.toHaveBeenCalled();
  });

  it('returns 400 when utterance is empty (Zod)', async () => {
    const res = await request(app)
      .post('/api/schedule-assistant/propose')
      .send({ projectId: 'project-1', utterance: '' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/schedule-assistant/apply
// ═══════════════════════════════════════════════════════════
describe('POST /api/schedule-assistant/apply', () => {
  it('returns 404 PROPOSAL_NOT_FOUND for unknown proposalId', async () => {
    const res = await request(app)
      .post('/api/schedule-assistant/apply')
      .send({ proposalId: 'nope' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('PROPOSAL_NOT_FOUND');
  });

  it('happy path: 200 + applies diff + audits', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周' }
    );
    const res = await request(app)
      .post('/api/schedule-assistant/apply')
      .send({ proposalId: proposed.proposalId });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.appliedDiff.items.length).toBeGreaterThan(0);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });

  it('returns 409 when project changed between propose and apply', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: 'x' }
    );
    // Mutate the snapshot returned next time
    const mutated = seedActivities();
    mutated[0].planEndDate = d('2026-03-08');
    mockPrisma.activity.findMany.mockResolvedValueOnce(mutated);
    const res = await request(app)
      .post('/api/schedule-assistant/apply')
      .send({ proposalId: proposed.proposalId });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('PROJECT_VERSION_MISMATCH');
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('returns 400 DEPENDENCY_CYCLE when add_dependency would form a cycle', async () => {
    mockDetectCycle.mockResolvedValueOnce(true);
    const proposed = await proposeFromIntent(
      intent([
        { type: 'add_dependency', activityId: 'A1', dependsOnId: 'A2', depType: '0' },
      ]),
      { rawUtterance: 'x' }
    );
    const res = await request(app)
      .post('/api/schedule-assistant/apply')
      .send({ proposalId: proposed.proposalId });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DEPENDENCY_CYCLE');
  });

  it('returns 400 for malformed body (no proposalId)', async () => {
    const res = await request(app).post('/api/schedule-assistant/apply').send({});
    expect(res.status).toBe(400);
  });
});
