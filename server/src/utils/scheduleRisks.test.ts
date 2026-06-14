import { describe, it, expect } from 'vitest';
import { assessRisks, type RiskFinding } from './scheduleRisks';
import {
  dryRunSchedule,
  type ActivitySnapshot,
  type ProjectSnapshot,
  type ScheduleOperation,
} from './scheduleEngine';

// ─── Helpers ──────────────────────────────────────────────
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const fmt = (date: Date | null | undefined) =>
  date ? date.toISOString().split('T')[0] : null;

const mkActivity = (overrides: Partial<ActivitySnapshot>): ActivitySnapshot => ({
  id: 'a',
  name: 'A',
  type: 'TASK',
  planStartDate: null,
  planEndDate: null,
  planDuration: null,
  hardConstraintDate: null,
  dependencies: [],
  ...overrides,
});

const baseSnap = (
  projectEndDate: Date | null = d('2026-09-01'),
  m1HardConstraint: Date | null = d('2026-08-03')
): ProjectSnapshot => ({
  projectId: 'p1',
  projectEndDate,
  activities: [
    mkActivity({
      id: 'A1',
      name: '硬件打样',
      planStartDate: d('2026-03-02'),
      planEndDate: d('2026-03-06'),
      planDuration: 5,
    }),
    mkActivity({
      id: 'A2',
      name: '固件联调',
      planStartDate: d('2026-03-09'),
      planEndDate: d('2026-03-13'),
      planDuration: 5,
      dependencies: [{ id: 'A1', type: '0' }],
    }),
    mkActivity({
      id: 'A3',
      name: '整机测试',
      planStartDate: d('2026-03-16'),
      planEndDate: d('2026-03-20'),
      planDuration: 5,
      dependencies: [{ id: 'A2', type: '0' }],
    }),
    mkActivity({
      id: 'M1',
      name: '验收里程碑',
      type: 'MILESTONE',
      planStartDate: d('2026-03-23'),
      planEndDate: d('2026-03-23'),
      planDuration: 1,
      hardConstraintDate: m1HardConstraint,
      dependencies: [{ id: 'A3', type: '0' }],
    }),
  ],
});

describe('assessRisks', () => {
  describe('no-op: empty diff', () => {
    it('returns no findings when no activities changed', () => {
      const snap = baseSnap();
      const dry = dryRunSchedule(snap, []);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings).toEqual([]);
    });
  });

  describe('R3 milestone_slip', () => {
    it('reports milestone_slip when a MILESTONE activity end date changes', () => {
      // A1 +14 cascades through A2 → A3 → M1
      const snap = baseSnap(null, null); // no project endDate, no hard constraint
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      const slip = findings.find((f) => f.kind === 'milestone_slip') as Extract<RiskFinding, { kind: 'milestone_slip' }> | undefined;
      expect(slip).toBeDefined();
      expect(slip?.activityId).toBe('M1');
      expect(fmt(slip?.before ?? null)).toBe('2026-03-23');
      expect(fmt(slip?.after ?? null)).not.toBe('2026-03-23');
    });

    it('does not report milestone_slip when only non-milestone activities changed', () => {
      // remove A2's dep on A1, then shift A1. M1 still depends on A3 which depends on A2,
      // but A2 no longer cascades from A1 → M1 unchanged.
      const snap = baseSnap(null, null);
      const ops: ScheduleOperation[] = [
        { type: 'remove_dependency', activityId: 'A2', dependsOnId: 'A1' },
        { type: 'shift_activity', activityId: 'A1', deltaDays: 2 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings.find((f) => f.kind === 'milestone_slip')).toBeUndefined();
    });
  });

  describe('R1/R2 hard_node_breach', () => {
    it('R1: reports hard_node_breach when MILESTONE projected end exceeds its hardConstraintDate', () => {
      // Big shift to push M1 past 2026-08-03
      const snap = baseSnap(null, d('2026-08-03'));
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 200 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      const breach = findings.find((f) => f.kind === 'hard_node_breach') as Extract<RiskFinding, { kind: 'hard_node_breach' }> | undefined;
      expect(breach).toBeDefined();
      expect(breach?.activityId).toBe('M1');
      expect(fmt(breach?.deadline ?? null)).toBe('2026-08-03');
    });

    it('R2: does NOT report hard_node_breach when M1 still finishes by the deadline', () => {
      const snap = baseSnap(null, d('2026-08-03'));
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 2 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings.find((f) => f.kind === 'hard_node_breach')).toBeUndefined();
    });

    it('does not report breach when activity has no hardConstraintDate', () => {
      const snap = baseSnap(null, null);
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 200 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings.find((f) => f.kind === 'hard_node_breach')).toBeUndefined();
    });

    it('checks hardConstraintDate against the NEW projected end (not original)', () => {
      // M1 starts at 2026-03-23 (well before 2026-08-03), but a +200-day shift pushes it past.
      // The point: the rule compares POST-cascade dates, not the pre-change dates.
      const snap = baseSnap(null, d('2026-08-03'));
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 200 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      const breach = findings.find((f) => f.kind === 'hard_node_breach') as Extract<RiskFinding, { kind: 'hard_node_breach' }> | undefined;
      expect(breach).toBeDefined();
      // projected > deadline
      expect((breach!.projected.getTime()) > breach!.deadline.getTime()).toBe(true);
    });
  });

  describe('R4 project_overdue', () => {
    it('R4: reports project_overdue when projected max-end exceeds Project.endDate', () => {
      const snap = baseSnap(d('2026-04-15'), null); // tight project deadline
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 60 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      const overdue = findings.find((f) => f.kind === 'project_overdue') as Extract<RiskFinding, { kind: 'project_overdue' }> | undefined;
      expect(overdue).toBeDefined();
      expect(fmt(overdue?.projectDeadline ?? null)).toBe('2026-04-15');
    });

    it('does not report project_overdue when projected end is within deadline', () => {
      const snap = baseSnap(d('2026-12-31'), null);
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings.find((f) => f.kind === 'project_overdue')).toBeUndefined();
    });

    it('does not report project_overdue when Project.endDate is null', () => {
      const snap = baseSnap(null, null);
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 200 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      expect(findings.find((f) => f.kind === 'project_overdue')).toBeUndefined();
    });
  });

  describe('multi-risk scenarios', () => {
    it('reports all applicable risks together (slip + breach + overdue)', () => {
      const snap = baseSnap(d('2026-04-15'), d('2026-08-03'));
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 200 },
      ];
      const dry = dryRunSchedule(snap, ops);
      const findings = assessRisks(snap, dry.snapshot, dry.diff);
      const kinds = findings.map((f) => f.kind).sort();
      expect(kinds).toContain('milestone_slip');
      expect(kinds).toContain('hard_node_breach');
      expect(kinds).toContain('project_overdue');
    });
  });
});
