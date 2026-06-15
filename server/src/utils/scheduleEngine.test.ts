import { describe, it, expect } from 'vitest';
import {
  computeProjectScheduleCascade,
  dryRunSchedule,
  UnknownActivityIdError,
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

const mkProject = (
  activities: ActivitySnapshot[],
  opts: Partial<ProjectSnapshot> = {}
): ProjectSnapshot => ({
  projectId: 'p1',
  projectEndDate: null,
  activities,
  ...opts,
});

const byId = (snap: ProjectSnapshot, id: string) =>
  snap.activities.find((a) => a.id === id);

// ─── computeProjectScheduleCascade ───────────────────────
describe('computeProjectScheduleCascade', () => {
  describe('empty / trivial inputs', () => {
    it('returns same dates when seedIds is empty', () => {
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          name: '硬件打样',
          planStartDate: d('2026-03-02'),
          planEndDate: d('2026-03-06'),
          planDuration: 5,
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, []);
      expect(result.changedIds.size).toBe(0);
      expect(fmt(byId(result.snapshot, 'A1')?.planEndDate)).toBe('2026-03-06');
    });

    it('returns no changes when seed has no dependents', () => {
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          planStartDate: d('2026-03-02'),
          planEndDate: d('2026-03-06'),
          planDuration: 5,
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, ['A1']);
      expect(result.changedIds.size).toBe(0);
    });
  });

  describe('single FS chain', () => {
    it('propagates one step downstream (A1 → A2)', () => {
      // A1 ends Fri 2026-03-06 → A2 should start Mon 2026-03-09
      // After cascade: A1 end shifts to 2026-03-20 (Fri) → A2 should start Mon 2026-03-23
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          name: '硬件打样',
          planStartDate: d('2026-03-16'),
          planEndDate: d('2026-03-20'), // already shifted (seed)
          planDuration: 5,
        }),
        mkActivity({
          id: 'A2',
          name: '固件联调',
          planStartDate: d('2026-03-09'), // old value, should be recomputed
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [{ id: 'A1', type: '0' }],
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, ['A1']);
      expect(result.changedIds.has('A2')).toBe(true);
      expect(fmt(byId(result.snapshot, 'A2')?.planStartDate)).toBe('2026-03-23');
      expect(fmt(byId(result.snapshot, 'A2')?.planEndDate)).toBe('2026-03-27');
    });

    it('propagates transitively (A1 → A2 → A3)', () => {
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          planStartDate: d('2026-03-16'),
          planEndDate: d('2026-03-20'),
          planDuration: 5,
        }),
        mkActivity({
          id: 'A2',
          planStartDate: d('2026-03-09'),
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [{ id: 'A1', type: '0' }],
        }),
        mkActivity({
          id: 'A3',
          planStartDate: d('2026-03-16'),
          planEndDate: d('2026-03-20'),
          planDuration: 5,
          dependencies: [{ id: 'A2', type: '0' }],
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, ['A1']);
      expect(result.changedIds.has('A2')).toBe(true);
      expect(result.changedIds.has('A3')).toBe(true);
      // A2 ends 2026-03-27 (Fri) → A3 starts 2026-03-30 (Mon), ends 2026-04-03 (Fri)
      expect(fmt(byId(result.snapshot, 'A3')?.planStartDate)).toBe('2026-03-30');
      expect(fmt(byId(result.snapshot, 'A3')?.planEndDate)).toBe('2026-04-03');
    });

    it('stops propagation when downstream date does not change', () => {
      // A2 already aligned with A1's existing end → no cascade
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          planStartDate: d('2026-03-02'),
          planEndDate: d('2026-03-06'), // Fri
          planDuration: 5,
        }),
        mkActivity({
          id: 'A2',
          planStartDate: d('2026-03-09'), // Mon, already correct
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [{ id: 'A1', type: '0' }],
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, ['A1']);
      expect(result.changedIds.has('A2')).toBe(false);
    });
  });

  describe('multi-dep convergence', () => {
    it('takes max start constraint from multiple predecessors (FS)', () => {
      // A3 depends on A1 and A2; A2 ends later → A3 driven by A2
      const snap = mkProject([
        mkActivity({
          id: 'A1',
          planStartDate: d('2026-03-02'),
          planEndDate: d('2026-03-06'), // Fri
          planDuration: 5,
        }),
        mkActivity({
          id: 'A2',
          planStartDate: d('2026-03-09'),
          planEndDate: d('2026-03-13'), // Fri (later)
          planDuration: 5,
        }),
        mkActivity({
          id: 'A3',
          planStartDate: d('2026-03-09'), // old value
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [
            { id: 'A1', type: '0' },
            { id: 'A2', type: '0' },
          ],
        }),
      ]);
      const result = computeProjectScheduleCascade(snap, ['A1', 'A2']);
      // A3 should start 2026-03-16 (Mon after A2's 2026-03-13 end)
      expect(fmt(byId(result.snapshot, 'A3')?.planStartDate)).toBe('2026-03-16');
    });
  });

  describe('multi-path reconvergence (GLM QA bug repro)', () => {
    // 单个 seed S 经两条不等长路径汇聚到 X（S→A→X 与 S→B→C→X），且 X→Y。
    // 期望：X 与 Y 都按"较晚路径"完整级联；Y 必须在 X 完成后才开始（FS 依赖）。
    // 背景：写入路径 cascadeUpdateDependents 以单个 changedActivity 作为 seed 调本函数，
    // 因此该拓扑会在生产中真实出现。
    it('fully cascades Y when a single seed reaches convergence node X via two unequal-length paths', () => {
      const snap = mkProject([
        mkActivity({
          id: 'S',
          planStartDate: d('2026-03-16'),
          planEndDate: d('2026-03-20'),
          planDuration: 5,
        }),
        mkActivity({
          id: 'A',
          planStartDate: d('2026-03-09'),
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [{ id: 'S', type: '0' }],
        }),
        mkActivity({
          id: 'B',
          planStartDate: d('2026-03-09'),
          planEndDate: d('2026-03-13'),
          planDuration: 5,
          dependencies: [{ id: 'S', type: '0' }],
        }),
        mkActivity({
          id: 'C',
          planStartDate: d('2026-03-16'),
          planEndDate: d('2026-03-20'),
          planDuration: 5,
          dependencies: [{ id: 'B', type: '0' }],
        }),
        mkActivity({
          id: 'X',
          planStartDate: d('2026-03-23'),
          planEndDate: d('2026-03-27'),
          planDuration: 5,
          dependencies: [
            { id: 'A', type: '0' },
            { id: 'C', type: '0' },
          ],
        }),
        mkActivity({
          id: 'Y',
          planStartDate: d('2026-03-30'),
          planEndDate: d('2026-04-03'),
          planDuration: 5,
          dependencies: [{ id: 'X', type: '0' }],
        }),
      ]);

      const result = computeProjectScheduleCascade(snap, ['S']);

      // X 正确收敛到较晚路径（经 C）：start 04-07，end 04-13（清明节 04-04~06 跳过）
      expect(fmt(byId(result.snapshot, 'X')?.planStartDate)).toBe('2026-04-07');
      expect(fmt(byId(result.snapshot, 'X')?.planEndDate)).toBe('2026-04-13');

      // Y 依赖 X（FS）→ 必须在 X 完成后开始。期望 start 04-14，end 04-20。
      // 实际（bug）：X 被"较短路径 A"率先更新时即被弹出并据中间值算出 Y；
      // 随后较长路径 C 把 X 更新到最终值，但 X 已被 visited 标记、不再重算下游，
      // 导致 Y 残留中间值 start 04-07、end 04-13（Y 在 X 完成前就开始——FS 依赖被违反）。
      expect(fmt(byId(result.snapshot, 'Y')?.planStartDate)).toBe('2026-04-14');
      expect(fmt(byId(result.snapshot, 'Y')?.planEndDate)).toBe('2026-04-20');
    });
  });

  describe('purity', () => {
    it('does not mutate input snapshot activities', () => {
      const a1 = mkActivity({
        id: 'A1',
        planStartDate: d('2026-03-16'),
        planEndDate: d('2026-03-20'),
        planDuration: 5,
      });
      const a2 = mkActivity({
        id: 'A2',
        planStartDate: d('2026-03-09'),
        planEndDate: d('2026-03-13'),
        planDuration: 5,
        dependencies: [{ id: 'A1', type: '0' }],
      });
      const snap = mkProject([a1, a2]);
      const originalA2Start = a2.planStartDate?.getTime();

      computeProjectScheduleCascade(snap, ['A1']);

      // Original objects untouched
      expect(a2.planStartDate?.getTime()).toBe(originalA2Start);
      expect(fmt(a2.planStartDate)).toBe('2026-03-09');
    });
  });
});

// ─── dryRunSchedule ──────────────────────────────────────
describe('dryRunSchedule', () => {
  const baseSnap = (): ProjectSnapshot =>
    mkProject(
      [
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
          hardConstraintDate: d('2026-08-03'),
          dependencies: [{ id: 'A3', type: '0' }],
        }),
      ],
      { projectEndDate: d('2026-09-01') }
    );

  describe('shift_activity (P1, P2)', () => {
    it('P1: shift A1 by +14 days → A1 dates move, downstream cascades', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a1After = byId(result.snapshot, 'A1');
      expect(fmt(a1After?.planStartDate)).toBe('2026-03-16');
      expect(fmt(a1After?.planEndDate)).toBe('2026-03-20');
      const a2After = byId(result.snapshot, 'A2');
      expect(fmt(a2After?.planStartDate)).toBe('2026-03-23');
      expect(result.changedIds.has('A1')).toBe(true);
      expect(result.changedIds.has('A2')).toBe(true);
      expect(result.changedIds.has('A3')).toBe(true);
      expect(result.changedIds.has('M1')).toBe(true);
    });

    it('P2: shift A1 by -3 days → A1 dates move backward', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: -3 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a1After = byId(result.snapshot, 'A1');
      expect(fmt(a1After?.planStartDate)).toBe('2026-02-27');
      expect(fmt(a1After?.planEndDate)).toBe('2026-03-03');
    });

    it('delta=0 → no changes reported', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 0 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const changed = result.diff.items.filter((i) => i.changed);
      expect(changed.length).toBe(0);
    });
  });

  describe('set_duration (P3)', () => {
    it('P3: A3 duration=5 keeps planStart, recomputes planEnd', () => {
      // A3 starts 2026-03-16 (Mon); duration=5 → end = 2026-03-20 (Fri) (same as before)
      // Change to duration=3 → end = 2026-03-18 (Wed)
      const ops: ScheduleOperation[] = [
        { type: 'set_duration', activityId: 'A3', durationDays: 3 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a3 = byId(result.snapshot, 'A3');
      expect(a3?.planDuration).toBe(3);
      expect(fmt(a3?.planStartDate)).toBe('2026-03-16');
      expect(fmt(a3?.planEndDate)).toBe('2026-03-18');
    });
  });

  describe('set_planned (P4)', () => {
    it('P4: A2 set_planned end → planEndDate set, planDuration recomputed', () => {
      // A2 normally starts 2026-03-09 (Mon).
      // set_planned end → 2026-03-17 (Tue) → planDuration = calculateWorkdays(Mon, Tue next week) = 7
      const ops: ScheduleOperation[] = [
        {
          type: 'set_planned',
          activityId: 'A2',
          field: 'end',
          date: '2026-03-17',
        },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a2 = byId(result.snapshot, 'A2');
      expect(fmt(a2?.planEndDate)).toBe('2026-03-17');
      // start unchanged
      expect(fmt(a2?.planStartDate)).toBe('2026-03-09');
      // duration recomputed
      expect(a2?.planDuration).toBe(7);
    });
  });

  describe('add_dependency / remove_dependency (P5, P6)', () => {
    it('add_dependency: appends to deps and recomputes from deps', () => {
      // Add A3 dep on A1 (already had A2 → A3). Now A3 has [A1, A2].
      // Both A1 and A2 are FS → A3 starts MAX(A1.end+1ws, A2.end+1ws) = A2.end+1ws = 2026-03-16 (unchanged)
      const ops: ScheduleOperation[] = [
        {
          type: 'add_dependency',
          activityId: 'A3',
          dependsOnId: 'A1',
          depType: '0',
        },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a3 = byId(result.snapshot, 'A3');
      expect(a3?.dependencies.map((d) => d.id).sort()).toEqual(['A1', 'A2']);
    });

    it('remove_dependency: removes from deps, keeps existing dates (no recompute when deps empty)', () => {
      const ops: ScheduleOperation[] = [
        { type: 'remove_dependency', activityId: 'A2', dependsOnId: 'A1' },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const a2 = byId(result.snapshot, 'A2');
      expect(a2?.dependencies.length).toBe(0);
      // Dates stay as they were
      expect(fmt(a2?.planStartDate)).toBe('2026-03-09');
    });
  });

  describe('P7: shift seed only, cascade handles downstream', () => {
    it('A1 +14 produces diff items for A1, A2, A3, M1 (cascade did the work)', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      const changedIds = new Set(
        result.diff.items.filter((i) => i.changed).map((i) => i.activityId)
      );
      expect(changedIds.has('A1')).toBe(true);
      expect(changedIds.has('A2')).toBe(true);
      expect(changedIds.has('A3')).toBe(true);
      expect(changedIds.has('M1')).toBe(true);
    });
  });

  describe('anti-hallucination guard', () => {
    it('throws UnknownActivityIdError when operation references unknown activityId', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'NOPE', deltaDays: 5 },
      ];
      expect(() => dryRunSchedule(baseSnap(), ops)).toThrow(UnknownActivityIdError);
    });

    it('throws UnknownActivityIdError when add_dependency references unknown dependsOnId', () => {
      const ops: ScheduleOperation[] = [
        {
          type: 'add_dependency',
          activityId: 'A2',
          dependsOnId: 'NOPE',
          depType: '0',
        },
      ];
      expect(() => dryRunSchedule(baseSnap(), ops)).toThrow(UnknownActivityIdError);
    });
  });

  describe('purity', () => {
    it('does not mutate input snapshot', () => {
      const snap = baseSnap();
      const a1Before = snap.activities.find((a) => a.id === 'A1');
      const a1StartBefore = a1Before?.planStartDate?.getTime();
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      dryRunSchedule(snap, ops);
      expect(a1Before?.planStartDate?.getTime()).toBe(a1StartBefore);
    });
  });

  describe('diff', () => {
    it('includes a row for every activity, with changed flag', () => {
      const ops: ScheduleOperation[] = [
        { type: 'shift_activity', activityId: 'A1', deltaDays: 14 },
      ];
      const result = dryRunSchedule(baseSnap(), ops);
      // All 4 activities should be present in diff
      expect(result.diff.items.length).toBe(4);
      const a1Row = result.diff.items.find((i) => i.activityId === 'A1');
      expect(a1Row?.changed).toBe(true);
      expect(fmt(a1Row?.before.start)).toBe('2026-03-02');
      expect(fmt(a1Row?.after.start)).toBe('2026-03-16');
    });
  });
});
