import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectSnapshot } from '../../../utils/scheduleEngine';

const { mockLoad, mockFingerprint, mockExecute, mockProjectFind } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockFingerprint: vi.fn(() => 'fp-1'),
  mockExecute: vi.fn(),
  mockProjectFind: vi.fn(),
}));

// Only mock DB-backed exports; pure logic (dryRunSchedule/assessRisks/parseIntentResponse) runs for real
vi.mock('../../scheduleAssistant', () => ({
  loadProjectSnapshot: mockLoad,
  computeSnapshotFingerprint: mockFingerprint,
  executeScheduleApply: mockExecute,
  DependencyCycleError: class extends Error {},
}));

// execute 修复后会调 prisma.project.findUnique 取 managerId 做 canManageProject 校验
vi.mock('../../../db', () => ({ default: { project: { findUnique: mockProjectFind } } }));

import { scheduleUpdateCapability } from './scheduleUpdate';
import { CapabilityForbiddenError } from './orchestrator';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const snapshot = (hardConstraint: Date | null = null): ProjectSnapshot => ({
  projectId: 'p1',
  projectEndDate: d('2026-12-31'),
  activities: [
    { id: 'A1', name: '硬件打样', type: 'TASK', planStartDate: d('2026-03-02'), planEndDate: d('2026-03-06'), planDuration: 5, hardConstraintDate: null, dependencies: [] },
    { id: 'A2', name: '固件联调', type: 'TASK', planStartDate: d('2026-03-09'), planEndDate: d('2026-03-13'), planDuration: 5, hardConstraintDate: null, dependencies: [{ id: 'A1', type: '0' }] },
    { id: 'M1', name: '验收里程碑', type: 'MILESTONE', planStartDate: d('2026-03-16'), planEndDate: d('2026-03-16'), planDuration: 1, hardConstraintDate: hardConstraint, dependencies: [{ id: 'A2', type: '0' }] },
  ],
});

const j = (obj: unknown) => JSON.stringify(obj);

beforeEach(() => {
  vi.clearAllMocks();
  mockFingerprint.mockReturnValue('fp-1');
  mockLoad.mockResolvedValue(snapshot());
});

describe('scheduleUpdateCapability', () => {
  it('declares name + permission + mode + target', () => {
    expect(scheduleUpdateCapability.name).toBe('schedule.update');
    expect(scheduleUpdateCapability.permission).toEqual({ resource: 'activity', action: 'update' });
    expect(scheduleUpdateCapability.mode).toBe('custom');
    expect(scheduleUpdateCapability.target).toBe('project');
  });

  describe('loadEntity', () => {
    it('builds entity with fingerprint, validIds, promptActivities (milestone flagged)', async () => {
      const entity = await scheduleUpdateCapability.loadEntity!('p1', {} as never);
      expect(entity?.fingerprint).toBe('fp-1');
      expect(entity?.id).toBe('p1');
      const f = entity?.fields as { validIds: string[]; promptActivities: { id: string; isMilestone: boolean }[] };
      expect(f.validIds).toEqual(['A1', 'A2', 'M1']);
      expect(f.promptActivities.find((a) => a.id === 'M1')?.isMilestone).toBe(true);
      expect(f.promptActivities.find((a) => a.id === 'A1')?.isMilestone).toBe(false);
    });

    it('returns null when project snapshot not found', async () => {
      mockLoad.mockResolvedValueOnce(null);
      expect(await scheduleUpdateCapability.loadEntity!('nope', {} as never)).toBeNull();
    });
  });

  describe('parseArgs (anti-hallucination guard delegated to parseIntentResponse)', () => {
    const makeEntity = () => ({
      id: 'p1',
      fingerprint: 'fp-1',
      fields: {
        snapshot: snapshot(),
        validIds: ['A1', 'A2', 'M1'],
        promptActivities: [],
      } as unknown as Record<string, unknown>,
    });

    it('ok for a valid shift referencing a real activity', () => {
      const r = scheduleUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(true);
    });

    it('fabricated when LLM invents an activity id', () => {
      const r = scheduleUpdateCapability.parseArgs!(
        j({ operations: [{ type: 'shift_activity', activityId: 'GHOST', deltaDays: 1 }], confidence: 'high', unresolved: [] }),
        {} as never,
        makeEntity()
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('fabricated');
    });

    it('not_understood for non-json input', () => {
      const r = scheduleUpdateCapability.parseArgs!('我不确定', {} as never, makeEntity());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('not_understood');
    });
  });

  describe('buildPreview (real dryRun + risk)', () => {
    const makeEntity = (snap = snapshot()) => ({
      id: 'p1',
      fingerprint: 'fp-1',
      fields: { snapshot: snap, validIds: ['A1', 'A2', 'M1'], promptActivities: [] } as unknown as Record<string, unknown>,
    });

    it('maps changed activities to diff rows', () => {
      const preview = scheduleUpdateCapability.buildPreview!(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }], confidence: 'high', unresolved: [] },
        makeEntity(),
        {} as never
      );
      const a1 = preview.rows.find((r) => r.key === 'A1');
      expect(a1).toBeDefined();
      expect(a1?.before).toContain('2026-03-02');
      expect(a1?.after).toContain('2026-03-16');
    });

    it('maps hard_node_breach risk with danger severity', () => {
      const preview = scheduleUpdateCapability.buildPreview!(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 60 }], confidence: 'high', unresolved: [] },
        makeEntity(snapshot(d('2026-03-20'))),
        {} as never
      );
      const breach = preview.risks.find((r) => r.kind === 'hard_node_breach');
      expect(breach?.severity).toBe('danger');
    });

    it('empty rows when operations produce no change (drives noop upstream)', () => {
      const preview = scheduleUpdateCapability.buildPreview!(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 0 }], confidence: 'high', unresolved: [] },
        makeEntity(),
        {} as never
      );
      expect(preview.rows).toHaveLength(0);
    });
  });

  describe('execute (delegates to shared executeScheduleApply)', () => {
    it('calls executeScheduleApply and maps result rows', async () => {
      // 修复后 execute 会先查 managerId 并过 canManageProject；这里以项目经理身份放行
      mockProjectFind.mockResolvedValue({ managerId: 'u1' });
      mockExecute.mockResolvedValueOnce({
        diff: { items: [{ activityId: 'A1', name: '硬件打样', before: { start: d('2026-03-02'), end: d('2026-03-06') }, after: { start: d('2026-03-16'), end: d('2026-03-20') }, changed: true }] },
        risks: [],
      });
      const entity = { id: 'p1', fingerprint: 'fp-1', fields: { snapshot: snapshot(), validIds: ['A1', 'A2', 'M1'], promptActivities: [] } as unknown as Record<string, unknown> };
      const intent = { projectId: 'p1', operations: [{ type: 'shift_activity' as const, activityId: 'A1', deltaDays: 14 }], confidence: 'high' as const, unresolved: [] };
      const managerReq = { user: { id: 'u1', collaboratingProjectIds: [] } } as never;
      const res = await scheduleUpdateCapability.execute(intent, {} as never, managerReq, { id: 'p1', entity });
      expect(mockExecute).toHaveBeenCalledWith('p1', intent.operations, expect.anything(), expect.anything());
      expect(res.rows[0].key).toBe('A1');
    });

    // ── BUG: execute 不校验当前用户是否为项目经理（与已修的 project.update 同源） ──
    // 真实路由 /api/schedule-assistant 有 canManageProject 门控（scheduleAssistant.ts:70），
    // 但 capability execute 直连 executeScheduleApply 写库，绕过了项目路由的权限中间件。
    it('BUG: 非项目经理经 AI 调整排期未被拦截（execute 缺 canManageProject）', async () => {
      mockProjectFind.mockResolvedValue({ managerId: 'owner-1' });
      const entity = { id: 'p1', fingerprint: 'fp-1', fields: { snapshot: snapshot(), validIds: ['A1', 'A2', 'M1'], promptActivities: [] } as unknown as Record<string, unknown> };
      const intent = { projectId: 'p1', operations: [{ type: 'shift_activity' as const, activityId: 'A1', deltaDays: 14 }], confidence: 'high' as const, unresolved: [] };
      const strangerReq = { user: { id: 'stranger', permissions: ['activity:update'], collaboratingProjectIds: [] } } as never;
      await expect(scheduleUpdateCapability.execute(intent, {} as never, strangerReq, { id: 'p1', entity })).rejects.toBeInstanceOf(CapabilityForbiddenError);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
