import { describe, it, expect } from 'vitest';
import {
  resolveActivityDates,
  DependencyInput,
  PredecessorData,
} from './dependencyScheduler';

// Helper: create a Date at midnight UTC
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

// Helper: format date to 'YYYY-MM-DD'
const fmt = (date: Date | undefined) =>
  date ? date.toISOString().split('T')[0] : undefined;

describe('resolveActivityDates', () => {
  // ─── Empty / invalid inputs ───────────────────────────────
  describe('empty / invalid inputs', () => {
    it('returns {} for empty deps array', () => {
      expect(resolveActivityDates([], [], 5)).toEqual({});
    });

    it('returns {} for null/undefined deps', () => {
      expect(resolveActivityDates(null as any, [], 5)).toEqual({});
      expect(resolveActivityDates(undefined as any, [], 5)).toEqual({});
    });

    it('returns {} when predecessor not found', () => {
      const deps: DependencyInput[] = [{ id: 'missing', type: '0' }];
      const preds: PredecessorData[] = [];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });

    it('returns {} when predecessor has no dates', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '0' }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: null, planEndDate: null, planDuration: null },
      ];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });
  });

  // ─── FS (type=0): Finish-to-Start ────────────────────────
  describe('FS (type=0) - Finish-to-Start', () => {
    it('lag=0 → successor starts next workday after predecessor ends', () => {
      // 2025-03-07 is Friday → next workday is Monday 2025-03-10
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-03-10');
    });

    it('lag>0 → successor starts lag workdays after predecessor ends', () => {
      // 2025-03-07 (Fri) + 3 workdays → 2025-03-12 (Wed)
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: 3 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-03-12');
    });

    it('lag<0 (lead) → successor starts before predecessor ends', () => {
      // 2025-03-07 (Fri), lag=-2 → offset -2 workdays → 2025-03-05 (Wed)
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: -2 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-03-05');
    });

    it('derives end date from start + duration', () => {
      // Start: 2025-03-10 (Mon), duration 3 → end = start + 2 workdays = 2025-03-12 (Wed)
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, 3);
      expect(fmt(result.planStartDate)).toBe('2025-03-10');
      expect(fmt(result.planEndDate)).toBe('2025-03-12');
      expect(result.planDuration).toBe(3);
    });

    it('skips predecessor with no planEndDate', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '0' }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: null, planDuration: null },
      ];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });
  });

  // ─── SS (type=1): Start-to-Start ─────────────────────────
  describe('SS (type=1) - Start-to-Start', () => {
    it('lag=0 → successor starts on the same day (nearest workday)', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '1', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      // lag=0 → offsetWorkdays(2025-03-03, 0) → 2025-03-03 is a workday
      expect(fmt(result.planStartDate)).toBe('2025-03-03');
    });

    it('lag>0 → successor starts lag workdays after predecessor starts', () => {
      // 2025-03-03 (Mon) + 2 workdays → 2025-03-05 (Wed)
      const deps: DependencyInput[] = [{ id: 'a1', type: '1', lag: 2 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-03-05');
    });

    it('lag<0 → successor starts before predecessor starts', () => {
      // 2025-03-03 (Mon), lag=-1 → 2025-02-28 (Fri)
      const deps: DependencyInput[] = [{ id: 'a1', type: '1', lag: -1 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-02-28');
    });

    it('skips predecessor with no planStartDate', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '1' }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: null, planEndDate: d('2025-03-07'), planDuration: null },
      ];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });
  });

  // ─── FF (type=2): Finish-to-Finish ───────────────────────
  describe('FF (type=2) - Finish-to-Finish', () => {
    it('lag=0 → successor ends on the same day (nearest workday)', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '2', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      // offsetWorkdays(2025-03-07, 0) → Fri is a workday
      expect(fmt(result.planEndDate)).toBe('2025-03-07');
    });

    it('lag>0 → successor ends lag workdays after predecessor ends', () => {
      // 2025-03-07 (Fri) + 2 → 2025-03-11 (Tue)
      const deps: DependencyInput[] = [{ id: 'a1', type: '2', lag: 2 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planEndDate)).toBe('2025-03-11');
    });

    it('derives start from end + duration (backward)', () => {
      // End: 2025-03-07 (Fri), duration 3 → start = end - 2 workdays = 2025-03-05 (Wed)
      const deps: DependencyInput[] = [{ id: 'a1', type: '2', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, 3);
      expect(fmt(result.planEndDate)).toBe('2025-03-07');
      expect(fmt(result.planStartDate)).toBe('2025-03-05');
      expect(result.planDuration).toBe(3);
    });

    it('skips predecessor with no planEndDate', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '2' }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: null, planDuration: null },
      ];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });
  });

  // ─── SF (type=3): Start-to-Finish ────────────────────────
  describe('SF (type=3) - Start-to-Finish', () => {
    it('lag=0 → successor ends on predecessor start day (nearest workday)', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '3', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planEndDate)).toBe('2025-03-03');
    });

    it('derives start from end + duration (backward)', () => {
      // End: 2025-03-03 (Mon), duration 3 → start = end - 2 workdays = 2025-02-27 (Thu)
      const deps: DependencyInput[] = [{ id: 'a1', type: '3', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, 3);
      expect(fmt(result.planEndDate)).toBe('2025-03-03');
      expect(fmt(result.planStartDate)).toBe('2025-02-27');
      expect(result.planDuration).toBe(3);
    });

    it('skips predecessor with no planStartDate', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '3' }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: null, planEndDate: d('2025-03-07'), planDuration: null },
      ];
      expect(resolveActivityDates(deps, preds, 5)).toEqual({});
    });
  });

  // ─── Multiple dependencies → MAX ─────────────────────────
  describe('multiple dependencies', () => {
    it('takes MAX of start constraints from multiple FS deps', () => {
      const deps: DependencyInput[] = [
        { id: 'a1', type: '0', lag: 0 }, // FS: pred ends 03-07 → start 03-10
        { id: 'a2', type: '0', lag: 0 }, // FS: pred ends 03-14 → start 03-17
      ];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
        { id: 'a2', planStartDate: d('2025-03-10'), planEndDate: d('2025-03-14'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      // MAX(03-10, 03-17) = 03-17
      expect(fmt(result.planStartDate)).toBe('2025-03-17');
    });

    it('takes MAX of end constraints from multiple FF deps', () => {
      const deps: DependencyInput[] = [
        { id: 'a1', type: '2', lag: 0 }, // FF: pred ends 03-07
        { id: 'a2', type: '2', lag: 0 }, // FF: pred ends 03-14
      ];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
        { id: 'a2', planStartDate: d('2025-03-10'), planEndDate: d('2025-03-14'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      // MAX(03-07, 03-14) = 03-14
      expect(fmt(result.planEndDate)).toBe('2025-03-14');
    });

    it('combines start and end constraints from mixed dep types', () => {
      const deps: DependencyInput[] = [
        { id: 'a1', type: '0', lag: 0 }, // FS → start constraint
        { id: 'a2', type: '2', lag: 0 }, // FF → end constraint
      ];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
        { id: 'a2', planStartDate: d('2025-03-10'), planEndDate: d('2025-03-14'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(fmt(result.planStartDate)).toBe('2025-03-10');
      expect(fmt(result.planEndDate)).toBe('2025-03-14');
    });
  });

  // ─── Duration derivation ──────────────────────────────────
  describe('duration derivation', () => {
    it('calculates duration when both start and end are known', () => {
      const deps: DependencyInput[] = [
        { id: 'a1', type: '0', lag: 0 }, // FS → start 03-10
        { id: 'a2', type: '2', lag: 0 }, // FF → end 03-14
      ];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
        { id: 'a2', planStartDate: d('2025-03-10'), planEndDate: d('2025-03-14'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(result.planDuration).toBeGreaterThan(0);
    });

    it('does not derive end when duration is null', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      expect(result.planStartDate).toBeDefined();
      expect(result.planEndDate).toBeUndefined();
    });

    it('does not derive end when duration is 0', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '0', lag: 0 }];
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, 0);
      expect(result.planStartDate).toBeDefined();
      expect(result.planEndDate).toBeUndefined();
    });

    it('default lag for FS is 1 workday', () => {
      const deps: DependencyInput[] = [{ id: 'a1', type: '0' }]; // no lag specified
      const preds: PredecessorData[] = [
        { id: 'a1', planStartDate: d('2025-03-03'), planEndDate: d('2025-03-07'), planDuration: 5 },
      ];
      const result = resolveActivityDates(deps, preds, null);
      // lag defaults to undefined → dep.lag ?? 0 = 0, then lag || 1 = 1
      expect(fmt(result.planStartDate)).toBe('2025-03-10');
    });
  });
});
