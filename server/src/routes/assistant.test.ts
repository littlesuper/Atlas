import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '../generated/prisma/client';

const {
  mockPrisma,
  mockGetAdapter,
  mockListAdapters,
  mockRunPropose,
  mockRunApply,
  mockResolveTarget,
  mockClassify,
  mockRunAsk,
  userState,
} = vi.hoisted(() => ({
  mockPrisma: { project: { findMany: vi.fn() } },
  mockGetAdapter: vi.fn(),
  mockListAdapters: vi.fn(),
  mockRunPropose: vi.fn(),
  mockRunApply: vi.fn(),
  mockResolveTarget: vi.fn(),
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

vi.mock('../services/assistant/registry', () => ({
  getAdapter: mockGetAdapter,
  listAdapters: mockListAdapters,
  registerAdapter: vi.fn(),
  listDomains: vi.fn(() => ['schedule']),
  __resetAdapters: vi.fn(),
}));

vi.mock('../services/assistant/targetResolver', () => ({ resolveProjectTarget: mockResolveTarget }));
vi.mock('../services/assistant/domainClassifier', () => ({ classifyDomain: mockClassify }));
vi.mock('../services/assistant/query/askService', () => ({ runAsk: mockRunAsk }));

vi.mock('../services/assistant/orchestrator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/assistant/orchestrator')>();
  return { ...actual, runPropose: mockRunPropose, runApply: mockRunApply };
});

import router from './assistant';
import {
  ProposalNotFoundError,
  VersionMismatchError,
  TargetNotFoundError,
} from '../services/assistant/orchestrator';
import { DependencyCycleError } from '../services/scheduleAssistant';

const app = express();
app.use(express.json());
app.use('/api/assistant', router);

const fakeAdapter = { domain: 'schedule', description: '排期', permission: { resource: 'activity', action: 'update' } };

beforeEach(() => {
  vi.clearAllMocks();
  userState.permissions = ['*:*'];
  mockGetAdapter.mockReturnValue(fakeAdapter);
  mockListAdapters.mockReturnValue([fakeAdapter]);
  mockClassify.mockResolvedValue({ status: 'ok', domain: 'schedule' });
  mockPrisma.project.findMany.mockResolvedValue([{ id: 'p1', name: '项目甲' }, { id: 'p2', name: '项目乙' }]);
  mockResolveTarget.mockResolvedValue({ status: 'ok', projectId: 'p1' });
  mockRunAsk.mockResolvedValue({ status: 'answered', answer: 'GW-X500 的 EVT 阶段：共 53 个工作日。', basis: 'deterministic' });
  mockRunPropose.mockResolvedValue({
    status: 'ok',
    proposalId: 'prop-1',
    preview: { rows: [{ key: 'A1', label: '硬件打样', before: 'x', after: 'y' }], risks: [] },
    narrative: '复述',
  });
});

const propose = (body: Record<string, unknown> = {}) =>
  request(app)
    .post('/api/assistant/propose')
    .send({ utterance: '把项目甲的硬件打样推迟两周', ...body });

describe('POST /api/assistant/propose (conversational, AI resolves target)', () => {
  it('ok: resolves target then 200 with proposalId + preview', async () => {
    const res = await propose();
    expect(res.status).toBe(200);
    expect(res.body.proposalId).toBe('prop-1');
    expect(mockResolveTarget).toHaveBeenCalled();
    expect(mockRunPropose).toHaveBeenCalledWith('schedule', 'p1', '把项目甲的硬件打样推迟两周');
  });

  it('passes contextProjectId hint to the resolver', async () => {
    await propose({ contextProjectId: 'p2' });
    expect(mockResolveTarget).toHaveBeenCalledWith(expect.objectContaining({ contextProjectId: 'p2' }));
  });

  it('only offers manageable, non-archived projects to the resolver', async () => {
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

  it('need_target (200 noOp) when AI cannot tell which project', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'unresolved' });
    const res = await propose({ utterance: '随便调一下' });
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
    expect(res.body.needTarget).toBe(true);
    expect(res.body.proposalId).toBeNull();
    expect(mockRunPropose).not.toHaveBeenCalled();
  });

  it('503 when target resolution AI is unavailable', async () => {
    mockResolveTarget.mockResolvedValueOnce({ status: 'ai_unavailable' });
    const res = await propose();
    expect(res.status).toBe(503);
    expect(res.body.error).toBe('AI_UNAVAILABLE');
  });

  it('classifies the domain from the utterance before resolving target', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'project' });
    mockGetAdapter.mockReturnValueOnce({ domain: 'project', description: '项目', permission: { resource: 'project', action: 'update' } });
    await propose({ utterance: '把项目甲优先级改成高' });
    expect(mockClassify).toHaveBeenCalled();
    expect(mockRunPropose).toHaveBeenCalledWith('project', 'p1', '把项目甲优先级改成高');
  });

  it('200 noOp when domain cannot be classified', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'unresolved' });
    const res = await propose({ utterance: '你好' });
    expect(res.status).toBe(200);
    expect(res.body.noOp).toBe(true);
    expect(res.body.proposalId).toBeNull();
    expect(mockResolveTarget).not.toHaveBeenCalled();
    expect(mockRunPropose).not.toHaveBeenCalled();
  });

  it('503 when classification AI is unavailable', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await propose()).status).toBe(503);
  });

  it('400 UNKNOWN_DOMAIN when classified domain has no adapter', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'ghost' });
    mockGetAdapter.mockReturnValueOnce(undefined);
    const res = await propose();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('UNKNOWN_DOMAIN');
  });

  it('403 when user lacks the classified-domain permission (no target-resolve / propose)', async () => {
    userState.permissions = ['project:read'];
    const res = await propose();
    expect(res.status).toBe(403);
    expect(mockResolveTarget).not.toHaveBeenCalled();
    expect(mockRunPropose).not.toHaveBeenCalled();
  });

  it('503 when scheduling parse AI unavailable (post-resolution)', async () => {
    mockRunPropose.mockResolvedValueOnce({ status: 'ai_unavailable' });
    expect((await propose()).status).toBe(503);
  });

  it('200 noOp when scheduling intent not understood', async () => {
    mockRunPropose.mockResolvedValueOnce({ status: 'not_understood', reason: 'fabricated_id' });
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
    expect(mockRunPropose).not.toHaveBeenCalled();
  });

  it('query: cross-project grounded answer (no single target needed)', async () => {
    mockClassify.mockResolvedValueOnce({ status: 'ok', domain: 'query' });
    mockRunAsk.mockResolvedValueOnce({ status: 'answered', answer: '据系统数据，风险最高的是 GW-X500。', basis: 'grounded' });
    const res = await propose({ utterance: '哪个项目最危险' });
    expect(res.status).toBe(200);
    expect(res.body.basis).toBe('grounded');
    // 跨项目问答不要求单一目标 → 不触发 need_target
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
    mockRunApply.mockResolvedValueOnce({ rows: [{ key: 'A1', label: '硬件打样', before: 'x', after: 'y' }], risks: [] });
    const res = await apply();
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.appliedDiff.rows).toHaveLength(1);
  });

  it('404 PROPOSAL_NOT_FOUND', async () => {
    mockRunApply.mockRejectedValueOnce(new ProposalNotFoundError());
    expect((await apply('nope')).status).toBe(404);
  });

  it('409 VERSION_MISMATCH', async () => {
    mockRunApply.mockRejectedValueOnce(new VersionMismatchError());
    expect((await apply()).status).toBe(409);
  });

  it('404 TARGET_NOT_FOUND', async () => {
    mockRunApply.mockRejectedValueOnce(new TargetNotFoundError());
    expect((await apply()).status).toBe(404);
  });

  it('400 DEPENDENCY_CYCLE', async () => {
    mockRunApply.mockRejectedValueOnce(new DependencyCycleError('A1'));
    const res = await apply();
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DEPENDENCY_CYCLE');
  });

  it('400 when proposalId missing (Zod)', async () => {
    expect((await request(app).post('/api/assistant/apply').send({})).status).toBe(400);
  });
});
