import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../generated/prisma/client';

const {
  mockPrisma,
  mockCapabilityPropose,
  mockCapabilityApply,
  mockGetCapability,
  mockListCapabilities,
  mockClassify,
  mockRunAsk,
  userState,
} = vi.hoisted(() => ({
  mockPrisma: { project: { findMany: vi.fn() }, role: { findMany: vi.fn() } },
  mockCapabilityPropose: vi.fn(),
  mockCapabilityApply: vi.fn(),
  mockGetCapability: vi.fn(),
  mockListCapabilities: vi.fn(),
  mockClassify: vi.fn(),
  mockRunAsk: vi.fn(),
  userState: { permissions: ['*:*'] as string[] },
}));

vi.mock('../db', () => ({ default: mockPrisma, prisma: mockPrisma }));
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
      permissions: userState.permissions,
      collaboratingProjectIds: [],
    };
    next();
  },
}));

vi.mock('../middleware/permission', () => ({
  isAdmin: (req: Request) => (req.user?.permissions || []).includes('*:*'),
}));

vi.mock('../services/assistant/capability/registry', () => ({
  getCapability: mockGetCapability,
  listCapabilitiesForUser: mockListCapabilities,
  registerCapability: vi.fn(),
  __resetCapabilities: vi.fn(),
}));

vi.mock('../services/assistant/capability/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/assistant/capability/orchestrator')>();
  return {
    ...actual,
    capabilityPropose: mockCapabilityPropose,
    capabilityApply: mockCapabilityApply,
  };
});

vi.mock('../services/assistant/domainClassifier', () => ({ classifyDomain: mockClassify }));
vi.mock('../services/assistant/query/askService', () => ({ runAsk: mockRunAsk }));

import router from './assistant';
import {
  ProposalNotFoundError,
  VersionMismatchError,
  TargetNotFoundError,
  CapabilityValidationError,
} from '../services/assistant/errors';
import { DependencyCycleError } from '../services/scheduleAssistant';

const app = express();
app.use(express.json());
app.use('/api/assistant', router);

const fakeCapability = {
  name: 'schedule.update',
  description: '调整活动排期',
  permission: { resource: 'activity', action: 'update' },
  mode: 'custom',
  target: 'project',
};

beforeEach(() => {
  vi.clearAllMocks();
  userState.permissions = ['*:*'];
  mockGetCapability.mockReturnValue(fakeCapability);
  mockListCapabilities.mockReturnValue([fakeCapability]);
  mockClassify.mockResolvedValue({ status: 'ok', domain: 'schedule.update' });
  mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1', name: '项目甲' }, { id: 'p2', name: '项目乙' }]);
  mockPrisma.role.findMany.mockResolvedValue([]);
  mockRunAsk.mockResolvedValue({ status: 'answered', answer: 'GW-X500 的 EVT 阶段：共 53 个工作日。', basis: 'deterministic' });
  mockCapabilityPropose.mockResolvedValue({
    status: 'ok',
    proposalId: 'prop-1',
    preview: { rows: [{ key: 'A1', label: '硬件打样', before: 'x', after: 'y' }], risks: [] },
    narrative: '复述',
  });
  mockCapabilityApply.mockResolvedValue({
    rows: [{ key: 'A1', label: '硬件打样', before: 'x', after: 'y' }],
    risks: [],
  });
});

const propose = (body: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/assistant/propose')
    .send({ utterance: '把项目甲的硬件打样推迟两周', ...body });

describe('POST /api/assistant/propose (capability dispatch)', () => {
  it('ok: classifies domain then dispatches to capability → 200 with proposalId + preview', async () => {
    const res = await propose();
    expect(res.status).toBe(200);
    expect(res.body.proposalId).toBe('prop-1');
    expect(mockClassify).toHaveBeenCalled();
    expect(mockCapabilityPropose).toHaveBeenCalledWith('schedule.update', '把项目甲的硬件打样推迟两周', expect.anything(), undefined);
  });

  it('passes contextProjectId into capability context', async () => {
    await propose({ contextProjectId: 'p2' });
    expect(mockCapabilityPropose).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ contextProjectId: 'p2' }),
      undefined
    );
  });

  it('only offers manageable, non-archived projects to the capability', async () => {
    await propose();
    const call = mockPrisma.project.findMany.mock.calls[0][0];
    expect(call.where.status).toEqual({ not: 'ARCHIVED' });
  });

  it('non-admin is scoped to own/collaborating projects', async () => {
    userState.permissions = ['activity:update'];
    await propose();
    const call = mockPrisma.project.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
  });

  it('need_target (200 noOp) when capability cannot identify the project', async () => {
    mockCapabilityPropose.mockResolvedValueOnce({ status: 'need_target' });
    const res = await propose({ utterance: '随便调一下' });
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
    expect(res.body.needTarget).toBe(true);
    expect(res.body.proposalId).toBeNull();
  });

  it('503 when classify AI is unavailable', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await propose()).status).toBe(503);
  });

  it('503 when capability propose AI unavailable', async () => {
    mockCapabilityPropose.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await propose()).status).toBe(503);
  });

  it('classifies the domain from the utterance before dispatching', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'project.update' });
    mockGetCapability.mockReturnValueOnce({ ...fakeCapability, name: 'project.update' });
    await propose({ utterance: '把项目甲优先级改成高' });
    expect(mockClassify).toHaveBeenCalled();
    expect(mockCapabilityPropose).toHaveBeenCalledWith('project.update', expect.anything(), expect.anything(), undefined);
  });

  it('200 noOp when domain cannot be classified', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'unresolved' });
    const res = await propose({ utterance: '你好' });
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
    expect(res.body.proposalId).toBeNull();
    expect(mockCapabilityPropose).not.toHaveBeenCalled();
  });

  it('400 UNKNOWN_DOMAIN when capability not found for domain', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'ghost' });
    mockGetCapability.mockReturnValueOnce(undefined);
    const res = await propose();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNKNOWN_DOMAIN');
  });

  it('200 noOp when capability returns not_understood', async () => {
    mockCapabilityPropose.mockResolvedValueOnce({ status: 'not_understood' });
    const res = await propose();
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
  });

  it('200 noOp when capability returns noop', async () => {
    mockCapabilityPropose.mockResolvedValueOnce({ status: 'noop' });
    const res = await propose();
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
  });

  it('400 when utterance empty (Zod)', async () => {
    expect((await propose({ utterance: '' })).status).toBe(400);
  });

  // ── 只读问答分支（runAsk：确定性优先 + 跨项目接地） ──
  it('query: classified as query → 200 with answer + basis (read-only, no proposal)', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    const res = await propose({ utterance: 'GW-X500 的 EVT 阶段花了多少工作日' });
    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('answer');
    expect(res.body.answer).toContain('EVT');
    expect(res.body.basis).toBe('deterministic');
    expect(res.body.proposalId).toBeNull();
    expect(mockRunAsk).toHaveBeenCalled();
    expect(mockCapabilityPropose).not.toHaveBeenCalled();
  });

  it('query: cross-project grounded answer (no single target needed)', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    mockRunAsk.mockResolvedValueOnce({ status: 'answered', answer: '据系统数据，风险最高的是 GW-X500。', basis: 'grounded' });
    const res = await propose({ utterance: '哪个项目最危险' });
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe('grounded');
    expect(res.body.needTarget).toBeUndefined();
  });

  it('query: does not require write permission', async () => {
    userState.permissions = ['project:read'];
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    const res = await propose({ utterance: 'GW-X500 风险有几个' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toBeTruthy();
  });

  it('query: 503 when ask AI unavailable', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    mockRunAsk.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await propose()).status).toBe(503);
  });

  // ── 端到端耗时回填（界面显示用） ──
  it('elapsedMs: ok path returns a non-negative number', async () => {
    const res = await propose();
    expect(res.status).toBe(200);
    expect(typeof res.body.elapsedMs).toBe('number');
    expect(res.body.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('elapsedMs: answer path returns a non-negative number', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    const res = await propose({ utterance: 'GW-X500 的 EVT 阶段花了多少工作日' });
    expect(res.status).toBe(200);
    expect(typeof res.body.elapsedMs).toBe('number');
    expect(res.body.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});

describe('POST /api/assistant/apply', () => {
  const apply = (proposalId = 'prop-1') => request(app).post('/api/assistant/apply').send({ proposalId });

  it('ok: 200 with appliedDiff', async () => {
    const res = await apply();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.appliedDiff.rows).toHaveLength(1);
  });

  it('404 PROPOSAL_NOT_FOUND', async () => {
    mockCapabilityApply.mockRejectedValueOnce(new ProposalNotFoundError());
    expect((await apply('nope')).status).toBe(404);
  });

  it('409 VERSION_MISMATCH', async () => {
    mockCapabilityApply.mockRejectedValueOnce(new VersionMismatchError());
    expect((await apply()).status).toBe(409);
  });

  it('404 TARGET_NOT_FOUND', async () => {
    mockCapabilityApply.mockRejectedValueOnce(new TargetNotFoundError());
    expect((await apply()).status).toBe(404);
  });

  it('400 DEPENDENCY_CYCLE', async () => {
    mockCapabilityApply.mockRejectedValueOnce(new DependencyCycleError('A1'));
    const res = await apply();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DEPENDENCY_CYCLE');
  });

  it('400 VALIDATION_ERROR (CapabilityValidationError, e.g. date range)', async () => {
    mockCapabilityApply.mockRejectedValueOnce(new CapabilityValidationError('结束日期不能早于开始日期'));
    const res = await apply();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('结束日期');
  });

  it('400 when proposalId missing (Zod)', async () => {
    expect((await request(app).post('/api/assistant/apply').send({})).status).toBe(400);
  });
});
