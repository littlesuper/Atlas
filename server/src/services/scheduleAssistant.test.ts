import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '../generated/prisma/client';

// ─── Hoisted mocks ─────────────────────────────────────────
const { mockPrisma, mockDetectCycle, mockAuditLog, mockUpdateProgress } =
  vi.hoisted(() => ({
    mockPrisma: {
      project: { findUnique: vi.fn() },
      activity: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((arg: unknown) =>
        Array.isArray(arg) ? Promise.all(arg) : Promise.resolve(arg)
      ),
    },
    mockDetectCycle: vi.fn().mockResolvedValue(false),
    mockAuditLog: vi.fn().mockResolvedValue(undefined),
    mockUpdateProgress: vi.fn().mockResolvedValue(undefined),
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

vi.mock('../utils/dependencyValidator', () => ({
  detectCircularDependency: mockDetectCycle,
}));

vi.mock('../utils/projectProgress', () => ({
  updateProjectProgress: mockUpdateProgress,
}));

vi.mock('../utils/auditLog', () => ({
  auditLog: mockAuditLog,
  diffFields: vi.fn(() => ({})),
}));

// ─── Imports under test ────────────────────────────────────
import {
  proposeFromIntent,
  applyProposal,
  proposalCache,
  ProjectNotFoundError,
  ProposalNotFoundError,
  ProjectVersionMismatchError,
  DependencyCycleError,
  computeSnapshotFingerprint,
  loadProjectSnapshot,
} from './scheduleAssistant';
import type { ScheduleChangeIntent } from '../schemas/scheduleAssistant';

// ─── Helpers ───────────────────────────────────────────────
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const seedActivities = (overrides: Partial<{
  withHardConstraint: boolean;
  hardConstraintDate: Date;
}> = {}) => [
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
  {
    id: 'A3',
    name: '整机测试',
    type: 'TASK',
    planStartDate: d('2026-03-16'),
    planEndDate: d('2026-03-20'),
    planDuration: 5,
    hardConstraintDate: null,
    dependencies: [{ id: 'A2', type: '0' }],
    sortOrder: 2,
  },
  {
    id: 'M1',
    name: '验收里程碑',
    type: 'MILESTONE',
    planStartDate: d('2026-03-23'),
    planEndDate: d('2026-03-23'),
    planDuration: 1,
    hardConstraintDate: overrides.withHardConstraint
      ? overrides.hardConstraintDate ?? d('2026-08-03')
      : null,
    dependencies: [{ id: 'A3', type: '0' }],
    sortOrder: 3,
  },
];

const makeReq = (overrides: Record<string, unknown> = {}) =>
  ({
    user: {
      id: 'user-1',
      realName: '测试用户',
      username: 'tester',
      permissions: ['*:*'],
      collaboratingProjectIds: [],
    },
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  }) as unknown as import('express').Request;

const intent = (operations: ScheduleChangeIntent['operations']): ScheduleChangeIntent => ({
  projectId: 'project-1',
  operations,
  confidence: 'high',
  unresolved: [],
});

beforeEach(() => {
  proposalCache.__reset();
  vi.clearAllMocks();
  mockDetectCycle.mockResolvedValue(false);
  mockPrisma.project.findUnique.mockResolvedValue({
    id: 'project-1',
    endDate: d('2026-09-01'),
  });
  mockPrisma.activity.findMany.mockResolvedValue(seedActivities());
});

// ─── loadProjectSnapshot ───────────────────────────────────
describe('loadProjectSnapshot', () => {
  it('builds a ProjectSnapshot from prisma', async () => {
    const snap = await loadProjectSnapshot('project-1');
    expect(snap).not.toBeNull();
    expect(snap!.projectId).toBe('project-1');
    expect(snap!.projectEndDate?.toISOString().split('T')[0]).toBe('2026-09-01');
    expect(snap!.activities.length).toBe(4);
    expect(snap!.activities[0].type).toBe('TASK');
    expect(snap!.activities[3].type).toBe('MILESTONE');
  });

  it('returns null when project does not exist', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce(null);
    const snap = await loadProjectSnapshot('nope');
    expect(snap).toBeNull();
  });
});

// ─── proposeFromIntent ─────────────────────────────────────
describe('proposeFromIntent', () => {
  it('creates a proposalId for non-empty operations', async () => {
    const result = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '把硬件打样推迟两周' }
    );
    expect(result.noOp).toBe(false);
    expect(result.proposalId).toBeDefined();
    expect(result.diff.items.length).toBeGreaterThan(0);
    const a1Diff = result.diff.items.find((i) => i.activityId === 'A1');
    expect(a1Diff?.changed).toBe(true);
  });

  it('detects hard_node_breach risk when shift pushes milestone past hardConstraint', async () => {
    mockPrisma.activity.findMany.mockResolvedValueOnce(
      seedActivities({ withHardConstraint: true, hardConstraintDate: d('2026-04-01') })
    );
    const result = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 200 }]),
      { rawUtterance: '推 200 天' }
    );
    expect(result.risks.some((r) => r.kind === 'hard_node_breach')).toBe(true);
  });

  it('returns noOp=true for empty operations and does NOT create a proposal', async () => {
    const result = await proposeFromIntent(
      {
        projectId: 'project-1',
        operations: [],
        confidence: 'low',
        unresolved: ['包装设计'],
      },
      { rawUtterance: '把包装设计推迟一周' }
    );
    expect(result.noOp).toBe(true);
    expect(result.proposalId).toBeUndefined();
    expect(result.narrative).toContain('没听懂');
    expect(result.narrative).toContain('包装设计');
  });

  it('throws ProjectNotFoundError for unknown projectId', async () => {
    mockPrisma.project.findUnique.mockResolvedValueOnce(null);
    await expect(
      proposeFromIntent(intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 1 }]), {
        rawUtterance: 'x',
      })
    ).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it('caches the intent + snapshot fingerprint so apply can resume', async () => {
    const result = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周' }
    );
    expect(result.proposalId).toBeDefined();
    // Verify cache hit (indirectly via re-reading later)
    expect(proposalCache.get(result.proposalId!)).not.toBeNull();
  });

  it('does NOT write to DB during propose (verifies 01 §J-7)', async () => {
    await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周' }
    );
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('uses narrate function when provided', async () => {
    const narrate = vi.fn().mockResolvedValue('AI 写的人话');
    const result = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周', narrate }
    );
    expect(narrate).toHaveBeenCalled();
    expect(result.narrative).toBe('AI 写的人话');
  });

  it('falls back to empty narrative when narrate throws (01 §G)', async () => {
    const narrate = vi.fn().mockRejectedValue(new Error('AI 故障'));
    const result = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周', narrate }
    );
    expect(result.narrative).toBe('');
    expect(result.proposalId).toBeDefined(); // 仍可应用
  });
});

// ─── applyProposal ─────────────────────────────────────────
describe('applyProposal', () => {
  it('throws ProposalNotFoundError for unknown id', async () => {
    await expect(applyProposal('does-not-exist', makeReq())).rejects.toBeInstanceOf(
      ProposalNotFoundError
    );
  });

  it('happy path: writes changed activities and audits with rawUtterance/intent/diff', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '把硬件打样推迟两周' }
    );
    const result = await applyProposal(proposed.proposalId!, makeReq());
    expect(result.ok).toBe(true);
    expect(mockPrisma.activity.update).toHaveBeenCalled();
    // Each changed activity should be updated
    const updates = mockPrisma.activity.update.mock.calls;
    expect(updates.length).toBeGreaterThanOrEqual(1);
    // Verify audit log carries the three required fields
    expect(mockAuditLog).toHaveBeenCalledTimes(1);
    const auditCall = mockAuditLog.mock.calls[0][0] as {
      changes: Record<string, { from: unknown; to: unknown }>;
      resourceType: string;
    };
    expect(auditCall.resourceType).toBe('schedule_assistant');
    expect(auditCall.changes.rawUtterance.to).toBe('把硬件打样推迟两周');
    expect(auditCall.changes.resolvedIntent).toBeDefined();
    expect(auditCall.changes.appliedDiff).toBeDefined();
  });

  it('rejects when project version (fingerprint) changed since propose (01 §J-11)', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: 'x' }
    );
    // Simulate a concurrent change by altering one activity's date
    const mutated = seedActivities();
    mutated[0].planEndDate = d('2026-03-09');
    mockPrisma.activity.findMany.mockResolvedValueOnce(mutated);
    await expect(applyProposal(proposed.proposalId!, makeReq())).rejects.toBeInstanceOf(
      ProjectVersionMismatchError
    );
    // Critically: no writes happened
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('rejects when dependency cycle would form (01 §J-9)', async () => {
    mockDetectCycle.mockResolvedValueOnce(true);
    const proposed = await proposeFromIntent(
      intent([
        { type: 'add_dependency', activityId: 'A1', dependsOnId: 'M1', depType: '0' },
      ]),
      { rawUtterance: '让 A1 依赖 M1' }
    );
    await expect(applyProposal(proposed.proposalId!, makeReq())).rejects.toBeInstanceOf(
      DependencyCycleError
    );
    expect(mockPrisma.activity.update).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('is idempotent: second apply returns same result without re-writing (01 §F.2)', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: 'x' }
    );
    const first = await applyProposal(proposed.proposalId!, makeReq());
    const writeCallsFirst = mockPrisma.activity.update.mock.calls.length;

    const second = await applyProposal(proposed.proposalId!, makeReq());
    expect(second.ok).toBe(true);
    // No additional writes
    expect(mockPrisma.activity.update.mock.calls.length).toBe(writeCallsFirst);
    // Same applied diff
    expect(second.appliedDiff).toEqual(first.appliedDiff);
  });

  it('§J-2 干跑=实算: propose diff deep-equals the diff applied at apply time', async () => {
    const proposed = await proposeFromIntent(
      intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
      { rawUtterance: '推迟两周' }
    );
    const applied = await applyProposal(proposed.proposalId!, makeReq());
    // The diff previewed in propose must equal the diff actually applied (same pure engine)
    expect(applied.appliedDiff).toEqual(proposed.diff);
  });

  it('writes dependencies field when add_dependency op is applied', async () => {
    const proposed = await proposeFromIntent(
      intent([
        { type: 'add_dependency', activityId: 'A3', dependsOnId: 'A1', depType: '0' },
      ]),
      { rawUtterance: '让 A3 也依赖 A1' }
    );
    await applyProposal(proposed.proposalId!, makeReq());
    // Find the update call for A3
    const a3Update = mockPrisma.activity.update.mock.calls.find(
      (c: unknown[]) => (c[0] as { where: { id: string } }).where.id === 'A3'
    );
    expect(a3Update).toBeDefined();
    const data = (a3Update![0] as { data: { dependencies?: unknown } }).data;
    expect(data.dependencies).toBeDefined();
  });
});

// ─── Proposal cache TTL ────────────────────────────────────
describe('ProposalCache', () => {
  it('expires entries after TTL', async () => {
    vi.useFakeTimers();
    try {
      const proposed = await proposeFromIntent(
        intent([{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }]),
        { rawUtterance: 'x' }
      );
      expect(proposalCache.get(proposed.proposalId!)).not.toBeNull();

      // Advance past TTL (10 min)
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(proposalCache.get(proposed.proposalId!)).toBeNull();

      // applyProposal should also reject
      await expect(applyProposal(proposed.proposalId!, makeReq())).rejects.toBeInstanceOf(
        ProposalNotFoundError
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

// ─── Fingerprint stability ─────────────────────────────────
describe('computeSnapshotFingerprint', () => {
  it('is stable for identical snapshots', async () => {
    const snap1 = await loadProjectSnapshot('project-1');
    const snap2 = await loadProjectSnapshot('project-1');
    expect(computeSnapshotFingerprint(snap1!)).toBe(computeSnapshotFingerprint(snap2!));
  });

  it('changes when any plan date or dependency changes', async () => {
    const snap1 = await loadProjectSnapshot('project-1');
    const fp1 = computeSnapshotFingerprint(snap1!);
    // Mutate
    snap1!.activities[0].planEndDate = d('2026-03-20');
    const fp2 = computeSnapshotFingerprint(snap1!);
    expect(fp2).not.toBe(fp1);
  });
});
