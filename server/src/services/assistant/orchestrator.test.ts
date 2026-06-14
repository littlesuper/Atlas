import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCallAi, mockExecute, mockAuditLog } = vi.hoisted(() => ({
  mockCallAi: vi.fn(),
  mockExecute: vi.fn((fn: () => Promise<unknown>) => fn()),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../utils/aiClient', () => ({ callAi: mockCallAi }));
vi.mock('../../utils/circuitBreaker', () => ({ aiCircuitBreaker: { execute: mockExecute } }));
vi.mock('../../utils/auditLog', () => ({ auditLog: mockAuditLog, diffFields: vi.fn(() => ({})) }));

import {
  runPropose,
  runApply,
  ProposalNotFoundError,
  VersionMismatchError,
  TargetNotFoundError,
  UnknownDomainError,
} from './orchestrator';
import { proposalStore } from './proposalStore';
import { registerAdapter, __resetAdapters } from './registry';
import type { AssistantActionAdapter, AdapterContext } from './types';

// ─── Fake adapter ─────────────────────────────────────────
const applySpy = vi.fn();
function makeAdapter(over: Partial<AssistantActionAdapter> = {}): AssistantActionAdapter {
  return {
    domain: 'fake',
    description: 'fake domain for tests',
    permission: { resource: 'project', action: 'update' },
    loadContext: vi.fn(async (targetId: string): Promise<AdapterContext | null> => ({
      targetId,
      fingerprint: 'fp-1',
      validIds: ['X1'],
    })),
    buildIntentSystemPrompt: () => 'sys',
    buildIntentUserPrompt: () => 'user',
    parseIntent: vi.fn(() => ({ ok: true as const, intent: { op: 'rename', id: 'X1' } })),
    buildPreview: vi.fn(() => ({
      rows: [{ key: 'X1', label: '名称', before: '旧', after: '新' }],
      risks: [],
    })),
    apply: applySpy.mockResolvedValue({ rows: [{ key: 'X1', label: '名称', before: '旧', after: '新' }], risks: [] }),
    ...over,
  };
}

const makeReq = () => ({ user: { id: 'u1', realName: 'T' }, headers: {}, socket: {} }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  proposalStore.__reset();
  __resetAdapters();
  mockExecute.mockImplementation((fn: () => Promise<unknown>) => fn());
  mockCallAi.mockResolvedValue({ content: '{"ok":true}' });
});

describe('runPropose', () => {
  it('ok: returns proposalId + preview + narrative; caches proposal', async () => {
    registerAdapter(makeAdapter());
    mockCallAi.mockResolvedValueOnce({ content: 'intent-json' }).mockResolvedValueOnce({ content: 'AI 复述' });
    const r = await runPropose('fake', 'p1', '把名称改成新');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.proposalId).toBeTruthy();
      expect(r.preview.rows).toHaveLength(1);
      expect(r.narrative).toBe('AI 复述');
      expect(proposalStore.get(r.proposalId)).not.toBeNull();
    }
  });

  it('throws UnknownDomainError for unregistered domain', async () => {
    await expect(runPropose('ghost', 'p1', 'x')).rejects.toBeInstanceOf(UnknownDomainError);
  });

  it('target_not_found when loadContext returns null', async () => {
    registerAdapter(makeAdapter({ loadContext: vi.fn().mockResolvedValue(null) }));
    expect((await runPropose('fake', 'nope', 'x')).status).toBe('target_not_found');
  });

  it('ai_unavailable when breaker open (execute throws)', async () => {
    registerAdapter(makeAdapter());
    mockExecute.mockRejectedValueOnce(new Error('熔断器已开启'));
    expect((await runPropose('fake', 'p1', 'x')).status).toBe('ai_unavailable');
  });

  it('ai_unavailable when callAi returns null', async () => {
    registerAdapter(makeAdapter());
    mockCallAi.mockResolvedValueOnce(null);
    expect((await runPropose('fake', 'p1', 'x')).status).toBe('ai_unavailable');
  });

  it('not_understood when adapter.parseIntent fails (fabricated id)', async () => {
    registerAdapter(makeAdapter({ parseIntent: vi.fn(() => ({ ok: false as const, kind: 'fabricated_id' as const, detail: 'GHOST' })) }));
    mockCallAi.mockResolvedValueOnce({ content: 'bad' });
    const r = await runPropose('fake', 'p1', 'x');
    expect(r.status).toBe('not_understood');
    if (r.status === 'not_understood') expect(r.reason).toBe('fabricated_id');
  });

  it('noop when preview has no rows', async () => {
    registerAdapter(makeAdapter({ buildPreview: vi.fn(() => ({ rows: [], risks: [] })) }));
    mockCallAi.mockResolvedValueOnce({ content: 'x' });
    expect((await runPropose('fake', 'p1', 'x')).status).toBe('noop');
  });

  it('narrative degrades to empty when narrate fails (still ok)', async () => {
    registerAdapter(makeAdapter());
    mockCallAi.mockResolvedValueOnce({ content: 'intent' }).mockRejectedValueOnce(new Error('AI down'));
    const r = await runPropose('fake', 'p1', 'x');
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.narrative).toBe('');
  });

  it('does not write DB during propose (no audit)', async () => {
    registerAdapter(makeAdapter());
    await runPropose('fake', 'p1', 'x');
    expect(mockAuditLog).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
  });
});

describe('runApply', () => {
  const setupProposal = async () => {
    registerAdapter(makeAdapter());
    mockCallAi.mockResolvedValueOnce({ content: 'intent' }).mockResolvedValueOnce({ content: 'narr' });
    const r = await runPropose('fake', 'p1', 'x');
    if (r.status !== 'ok') throw new Error('setup failed');
    return r.proposalId;
  };

  it('ProposalNotFoundError for unknown id', async () => {
    await expect(runApply('nope', makeReq())).rejects.toBeInstanceOf(ProposalNotFoundError);
  });

  it('happy path: calls adapter.apply + writes assistant audit (rawUtterance+intent+diff)', async () => {
    const id = await setupProposal();
    const res = await runApply(id, makeReq());
    expect(res.rows).toHaveLength(1);
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const audit = mockAuditLog.mock.calls[0][0] as { resourceType: string; changes: Record<string, { to: unknown }> };
    expect(audit.resourceType).toBe('assistant');
    expect(audit.changes.rawUtterance.to).toBe('x');
    expect(audit.changes.resolvedIntent).toBeDefined();
    expect(audit.changes.appliedDiff).toBeDefined();
  });

  it('VersionMismatchError when fingerprint changed since propose', async () => {
    registerAdapter(
      makeAdapter({
        loadContext: vi
          .fn()
          .mockResolvedValueOnce({ targetId: 'p1', fingerprint: 'fp-1' }) // propose
          .mockResolvedValueOnce({ targetId: 'p1', fingerprint: 'fp-CHANGED' }), // apply
      })
    );
    mockCallAi.mockResolvedValueOnce({ content: 'intent' }).mockResolvedValueOnce({ content: 'narr' });
    const r = await runPropose('fake', 'p1', 'x');
    if (r.status !== 'ok') throw new Error('setup failed');
    await expect(runApply(r.proposalId, makeReq())).rejects.toBeInstanceOf(VersionMismatchError);
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('TargetNotFoundError when target vanished before apply', async () => {
    registerAdapter(
      makeAdapter({
        loadContext: vi
          .fn()
          .mockResolvedValueOnce({ targetId: 'p1', fingerprint: 'fp-1' })
          .mockResolvedValueOnce(null),
      })
    );
    mockCallAi.mockResolvedValueOnce({ content: 'intent' }).mockResolvedValueOnce({ content: 'narr' });
    const r = await runPropose('fake', 'p1', 'x');
    if (r.status !== 'ok') throw new Error('setup failed');
    await expect(runApply(r.proposalId, makeReq())).rejects.toBeInstanceOf(TargetNotFoundError);
  });

  it('idempotent: second apply returns cached, adapter.apply called once', async () => {
    const id = await setupProposal();
    await runApply(id, makeReq());
    await runApply(id, makeReq());
    expect(applySpy).toHaveBeenCalledTimes(1);
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
  });
});
