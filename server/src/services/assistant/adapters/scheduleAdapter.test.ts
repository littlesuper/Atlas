import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ProjectSnapshot } from '../../../utils/scheduleEngine';

const { mockLoad, mockFingerprint, mockExecute } = vi.hoisted(() => ({
  mockLoad: vi.fn(),
  mockFingerprint: vi.fn(() => 'fp-1'),
  mockExecute: vi.fn(),
}));

// 只 mock 带 DB 的导出；纯逻辑（dryRunSchedule/assessRisks/parseIntentResponse）走真实实现
vi.mock('../../scheduleAssistant', () => ({
  loadProjectSnapshot: mockLoad,
  computeSnapshotFingerprint: mockFingerprint,
  executeScheduleApply: mockExecute,
  DependencyCycleError: class extends Error {},
}));

import { scheduleAdapter } from './scheduleAdapter';
import type { AdapterContext } from '../types';

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

describe('scheduleAdapter', () => {
  it('declares domain + permission', () => {
    expect(scheduleAdapter.domain).toBe('schedule');
    expect(scheduleAdapter.permission).toEqual({ resource: 'activity', action: 'update' });
  });

  describe('loadContext', () => {
    it('builds context with fingerprint, validIds, prompt activities (milestone flagged)', async () => {
      const ctx = (await scheduleAdapter.loadContext('p1')) as AdapterContext & { validIds: string[]; promptActivities: { id: string; isMilestone: boolean }[] };
      expect(ctx?.fingerprint).toBe('fp-1');
      expect(ctx.validIds).toEqual(['A1', 'A2', 'M1']);
      expect(ctx.promptActivities.find((a) => a.id === 'M1')?.isMilestone).toBe(true);
      expect(ctx.promptActivities.find((a) => a.id === 'A1')?.isMilestone).toBe(false);
    });

    it('returns null when project snapshot not found', async () => {
      mockLoad.mockResolvedValueOnce(null);
      expect(await scheduleAdapter.loadContext('nope')).toBeNull();
    });
  });

  describe('parseIntent (anti-hallucination guard delegated to parseIntentResponse)', () => {
    it('ok for a valid shift referencing a real activity', async () => {
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const r = scheduleAdapter.parseIntent(
        j({ operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }], confidence: 'high', unresolved: [] }),
        ctx
      );
      expect(r.ok).toBe(true);
    });

    it('fabricated_id when LLM invents an activity id', async () => {
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const r = scheduleAdapter.parseIntent(
        j({ operations: [{ type: 'shift_activity', activityId: 'GHOST', deltaDays: 1 }], confidence: 'high', unresolved: [] }),
        ctx
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.kind).toBe('fabricated_id');
    });
  });

  describe('buildPreview (real dryRun + risk)', () => {
    it('maps changed activities to diff rows', async () => {
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const preview = scheduleAdapter.buildPreview(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 14 }], confidence: 'high', unresolved: [] },
        ctx
      );
      const a1 = preview.rows.find((r) => r.key === 'A1');
      expect(a1).toBeDefined();
      expect(a1?.before).toContain('2026-03-02');
      expect(a1?.after).toContain('2026-03-16');
    });

    it('maps hard_node_breach risk with danger severity', async () => {
      mockLoad.mockResolvedValueOnce(snapshot(d('2026-03-20'))); // M1 hard node soon
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const preview = scheduleAdapter.buildPreview(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 60 }], confidence: 'high', unresolved: [] },
        ctx
      );
      const breach = preview.risks.find((r) => r.kind === 'hard_node_breach');
      expect(breach?.severity).toBe('danger');
    });

    it('empty rows when operations produce no change (drives noop upstream)', async () => {
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const preview = scheduleAdapter.buildPreview(
        { projectId: 'p1', operations: [{ type: 'shift_activity', activityId: 'A1', deltaDays: 0 }], confidence: 'high', unresolved: [] },
        ctx
      );
      expect(preview.rows).toHaveLength(0);
    });
  });

  describe('apply (delegates to shared executeScheduleApply)', () => {
    it('calls executeScheduleApply and maps result rows', async () => {
      mockExecute.mockResolvedValueOnce({
        diff: { items: [{ activityId: 'A1', name: '硬件打样', before: { start: d('2026-03-02'), end: d('2026-03-06') }, after: { start: d('2026-03-16'), end: d('2026-03-20') }, changed: true }] },
        risks: [],
      });
      const ctx = (await scheduleAdapter.loadContext('p1'))!;
      const intent = { projectId: 'p1', operations: [{ type: 'shift_activity' as const, activityId: 'A1', deltaDays: 14 }], confidence: 'high' as const, unresolved: [] };
      const res = await scheduleAdapter.apply(intent, ctx, {} as never);
      expect(mockExecute).toHaveBeenCalledWith('p1', intent.operations, expect.anything(), expect.anything());
      expect(res.rows[0].key).toBe('A1');
    });
  });
});
