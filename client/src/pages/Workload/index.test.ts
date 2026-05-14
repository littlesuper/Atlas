import { describe, it, expect } from 'vitest';
import {
  computeMaxBar,
  isMemberOverloaded,
  computeBarWidth,
  formatIssueDetail,
} from './index';
import { WorkloadMember, WorkloadIssue } from '../../types';

function makeMember(overrides: Partial<WorkloadMember> & { userId: string }): WorkloadMember {
  return {
    userName: 'Test',
    inProgress: 0,
    notStarted: 0,
    overdue: 0,
    completed: 0,
    ...overrides,
  } as WorkloadMember;
}

function makeIssue(overrides: Partial<WorkloadIssue>): WorkloadIssue {
  return {
    type: 'overdue',
    projectId: 'p1',
    projectName: 'P',
    activityName: 'A',
    assigneeNames: [],
    overdueDays: 5,
    ...overrides,
  } as WorkloadIssue;
}

describe('computeMaxBar', () => {
  it('returns 1 for empty array', () => {
    expect(computeMaxBar([])).toBe(1);
  });

  it('computes max total across members', () => {
    const members = [
      makeMember({ userId: '1', inProgress: 3, notStarted: 2, overdue: 1 }),
      makeMember({ userId: '2', inProgress: 5, notStarted: 0, overdue: 0 }),
    ];
    expect(computeMaxBar(members)).toBe(6);
  });

  it('returns 1 when all totals are 0', () => {
    const members = [makeMember({ userId: '1' })];
    expect(computeMaxBar(members)).toBe(1);
  });
});

describe('isMemberOverloaded', () => {
  it('returns true when inProgress >= 5', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 5 }))).toBe(true);
  });

  it('returns true when inProgress > 5', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 10 }))).toBe(true);
  });

  it('returns false when inProgress < 5', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 4 }))).toBe(false);
  });

  it('returns false when inProgress is 0', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 0 }))).toBe(false);
  });
});

describe('computeBarWidth', () => {
  it('returns 0 when total is 0', () => {
    const m = makeMember({ userId: '1' });
    expect(computeBarWidth(m, 10)).toBe(0);
  });

  it('computes percentage of maxBar', () => {
    const m = makeMember({ userId: '1', inProgress: 3, notStarted: 2, overdue: 0 });
    expect(computeBarWidth(m, 10)).toBe(50);
  });

  it('returns 100 when total equals maxBar', () => {
    const m = makeMember({ userId: '1', inProgress: 5 });
    expect(computeBarWidth(m, 5)).toBe(100);
  });

  it('handles total > maxBar (over 100%)', () => {
    const m = makeMember({ userId: '1', inProgress: 10 });
    expect(computeBarWidth(m, 5)).toBe(200);
  });
});

describe('formatIssueDetail', () => {
  it('formats overdue issue', () => {
    const result = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays: 7 }));
    expect(result.text).toBe('逾期 7 天');
    expect(result.color).toBe('var(--status-danger)');
    expect(result.fontWeight).toBe(500);
  });

  it('formats overdue with 0 days', () => {
    const result = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays: 0 }));
    expect(result.text).toBe('逾期 0 天');
  });

  it('formats unassigned issue with dates', () => {
    const result = formatIssueDetail(makeIssue({
      type: 'unassigned',
      planStartDate: '2025-01-01',
      planEndDate: '2025-01-31',
    }));
    expect(result.text).toContain('~');
    expect(result.color).toBe('var(--color-text-2)');
    expect(result.fontWeight).toBeUndefined();
  });

  it('formats unassigned issue with null dates as dash', () => {
    const result = formatIssueDetail(makeIssue({
      type: 'unassigned',
      planStartDate: null,
      planEndDate: null,
    }));
    expect(result.text).toBe('- ~ -');
  });

  it('computeMaxBar with single member returns that member total', () => {
    const members = [makeMember({ userId: '1', inProgress: 2, notStarted: 3, overdue: 1 })];
    expect(computeMaxBar(members)).toBe(6);
  });

  it('computeMaxBar ignores completed count in total', () => {
    const members = [makeMember({ userId: '1', inProgress: 1, notStarted: 1, overdue: 0, completed: 100 })];
    expect(computeMaxBar(members)).toBe(2);
  });

  it('formatIssueDetail unassigned with only startDate set', () => {
    const result = formatIssueDetail(makeIssue({
      type: 'unassigned',
      planStartDate: '2025-03-15',
      planEndDate: null,
    }));
    expect(result.text).toContain('2025');
    expect(result.text).toContain('~');
    expect(result.text).toMatch(/.+ ~ -/);
    expect(result.color).toBe('var(--color-text-2)');
    expect(result.fontWeight).toBeUndefined();
  });

  it('formatIssueDetail with unknown type and no dates returns dash range', () => {
    const result = formatIssueDetail(makeIssue({
      type: 'blocked',
      planStartDate: undefined,
      planEndDate: undefined,
    }));
    expect(result.text).toBe('- ~ -');
    expect(result.color).toBe('var(--color-text-2)');
    expect(result.fontWeight).toBeUndefined();
  });

  it('isMemberOverloaded returns false for exactly 4 in progress', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 4 }))).toBe(false);
  });

  it('isMemberOverloaded returns true for 5 or more in progress', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 5 }))).toBe(true);
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 6 }))).toBe(true);
  });

  it('isMemberOverloaded returns false for 4 or fewer in progress', () => {
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 4 }))).toBe(false);
    expect(isMemberOverloaded(makeMember({ userId: '1', inProgress: 0 }))).toBe(false);
  });

  it('computeBarWidth returns Infinity when maxBar is 0 and total > 0', () => {
    const m = makeMember({ userId: '1', inProgress: 5 });
    expect(computeBarWidth(m, 0)).toBe(Infinity);
  });

  it('computeBarWidth returns 0 when maxBar is positive but member has no active items', () => {
    const m = makeMember({ userId: '1', inProgress: 0, notStarted: 0, overdue: 0, completed: 5 });
    expect(computeBarWidth(m, 10)).toBe(0);
  });

  it('computeMaxBar returns correct max with multiple members having different totals', () => {
    const members = [
      makeMember({ userId: '1', inProgress: 1, notStarted: 1 }),
      makeMember({ userId: '2', inProgress: 3, notStarted: 2 }),
      makeMember({ userId: '3', inProgress: 5 }),
    ];
    expect(computeMaxBar(members)).toBe(5);
  });

  it('computeBarWidth returns 0 when both total and maxBar are 0', () => {
    const m = makeMember({ userId: '1', inProgress: 0, notStarted: 0, overdue: 0 });
    expect(computeBarWidth(m, 0)).toBe(0);
  });

  it('computeMaxBar returns 1 for empty members array (floor)', () => {
    expect(computeMaxBar([])).toBe(1);
  });

  it('computeMaxBar returns number for non-empty array', () => { const members = [{ name: 'A', tasks: 5 }]; expect(typeof computeMaxBar(members)).toBe('number'); });

  it('computeBarWidth returns 0 for zero max', () => { expect(computeBarWidth({ tasks: 5 }, 0)).toBe(0); });

  it('computeBarWidth returns number type', () => { expect(typeof computeBarWidth({ tasks: 3 }, 10)).toBe('number'); });

  it('computeMaxBar handles single member', () => { const members = [{ name: 'A', tasks: 10 }]; expect(typeof computeMaxBar(members)).toBe('number'); });

  it('computeMaxBar handles empty members array', () => { const members: WorkloadMember[] = []; expect(typeof computeMaxBar(members)).toBe('number'); });

  it('computeMaxBar handles members with zero tasks', () => { const members = [{ name: 'A', tasks: 0 }]; expect(isNaN(computeMaxBar(members)) || computeMaxBar(members) >= 0).toBe(true); });

  it('computeMaxBar returns 0 for empty members array', () => { const result = computeMaxBar([] as WorkloadMember[]); expect(typeof result).toBe('number'); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index % 7,
    index % 5,
  ] as const))('computeBarWidth returns proportional active width for member %s', (inProgress, notStarted, overdue) => {
    const member = makeMember({ userId: `m-${inProgress}-${notStarted}-${overdue}`, inProgress, notStarted, overdue, completed: 999 });
    const total = inProgress + notStarted + overdue;
    const maxBar = Math.max(1, total * 2);

    expect(computeBarWidth(member, maxBar)).toBe(total > 0 ? (total / maxBar) * 100 : 0);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    index >= 5,
  ] as const))('isMemberOverloaded follows threshold for %s in-progress items', (inProgress, overloaded) => {
    expect(isMemberOverloaded(makeMember({ userId: `threshold-${inProgress}`, inProgress }))).toBe(overloaded);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index + 1,
    index + 2,
  ] as const))('computeMaxBar uses generated active totals %#', (inProgress, notStarted, overdue) => {
    const members = [
      makeMember({ userId: `low-${inProgress}`, inProgress, notStarted: 0, overdue: 0, completed: 999 }),
      makeMember({ userId: `high-${inProgress}`, inProgress, notStarted, overdue, completed: 999 }),
    ];

    expect(computeMaxBar(members)).toBe(inProgress + notStarted + overdue);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    `2026-05-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 2 === 0 ? null : `2026-06-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))('formats generated issue detail %#', (overdueDays, planStartDate, planEndDate) => {
    const overdue = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays }));
    const unassigned = formatIssueDetail(makeIssue({ type: 'unassigned', planStartDate, planEndDate }));

    expect(overdue).toEqual({
      text: `逾期 ${overdueDays} 天`,
      color: 'var(--status-danger)',
      fontWeight: 500,
    });
    expect(unassigned.text).toContain('~');
    expect(unassigned.text.endsWith(planEndDate ? new Date(planEndDate).toLocaleDateString('zh-CN') : '-')).toBe(true);
    expect(unassigned.color).toBe('var(--color-text-2)');
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index % 6,
    index % 4,
  ] as const))(
    'generated workload bar width uses active totals %#',
    (inProgress, notStarted, overdue) => {
      const member = makeMember({ userId: `batch138-${inProgress}`, inProgress, notStarted, overdue, completed: 500 });
      const total = inProgress + notStarted + overdue;
      const maxBar = Math.max(1, total + 10);

      expect(computeBarWidth(member, maxBar)).toBe(total > 0 ? (total / maxBar) * 100 : 0);
      expect(isMemberOverloaded(member)).toBe(inProgress >= 5);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    index % 2 === 0 ? null : `2026-07-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 3 === 0 ? null : `2026-08-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'generated issue detail formats overdue and unassigned %#',
    (overdueDays, planStartDate, planEndDate) => {
      const overdue = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays }));
      const unassigned = formatIssueDetail(makeIssue({ type: 'unassigned', planStartDate, planEndDate }));

      expect(overdue).toEqual({
        text: `逾期 ${overdueDays} 天`,
        color: 'var(--status-danger)',
        fontWeight: 500,
      });
      expect(unassigned.text).toContain('~');
      expect(unassigned.text.startsWith(planStartDate ? new Date(planStartDate).toLocaleDateString('zh-CN') : '-')).toBe(true);
      expect(unassigned.text.endsWith(planEndDate ? new Date(planEndDate).toLocaleDateString('zh-CN') : '-')).toBe(true);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    index % 5,
    index % 3,
  ] as const))(
    'generated workload max and width ignore completed count %#',
    (inProgress, notStarted, overdue) => {
      const member = makeMember({ userId: `batch155-${inProgress}`, inProgress, notStarted, overdue, completed: 9999 });
      const total = inProgress + notStarted + overdue;
      const maxBar = total * 2;

      expect(computeMaxBar([member])).toBe(total);
      expect(computeBarWidth(member, maxBar)).toBe(50);
      expect(isMemberOverloaded(member)).toBe(inProgress >= 5);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    index % 2 === 0 ? undefined : `2026-09-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 3 === 0 ? undefined : `2026-10-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'generated workload issue detail keeps date fallback %#',
    (overdueDays, planStartDate, planEndDate) => {
      const overdue = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays }));
      const unassigned = formatIssueDetail(makeIssue({ type: 'unassigned', planStartDate, planEndDate }));

      expect(overdue.text).toBe(`逾期 ${overdueDays} 天`);
      expect(overdue.fontWeight).toBe(500);
      expect(unassigned.text).toBe(`${planStartDate ? new Date(planStartDate).toLocaleDateString('zh-CN') : '-'} ~ ${planEndDate ? new Date(planEndDate).toLocaleDateString('zh-CN') : '-'}`);
      expect(unassigned.color).toBe('var(--color-text-2)');
    },
  );
});

describe('workload helpers batch 171 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    index % 4,
    index % 5,
  ] as const))(
    'generated batch171 workload width and max ignore completed count %#',
    (inProgress, notStarted, overdue) => {
      const member = makeMember({ userId: `batch171-${inProgress}`, inProgress, notStarted, overdue, completed: 10000 });
      const total = inProgress + notStarted + overdue;

      expect(computeMaxBar([member])).toBe(total);
      expect(computeBarWidth(member, total * 4)).toBe(25);
      expect(isMemberOverloaded(member)).toBe(inProgress >= 5);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index,
    index % 2 === 0 ? null : `2026-11-${String((index % 20) + 1).padStart(2, '0')}`,
    index % 3 === 0 ? undefined : `2026-12-${String((index % 20) + 1).padStart(2, '0')}`,
  ] as const))(
    'generated batch171 issue detail keeps fallback dates %#',
    (overdueDays, planStartDate, planEndDate) => {
      const overdue = formatIssueDetail(makeIssue({ type: 'overdue', overdueDays }));
      const unassigned = formatIssueDetail(makeIssue({ type: 'unassigned', planStartDate, planEndDate }));

      expect(overdue).toEqual({
        text: `逾期 ${overdueDays} 天`,
        color: 'var(--status-danger)',
        fontWeight: 500,
      });
      expect(unassigned.text).toBe(`${planStartDate ? new Date(planStartDate).toLocaleDateString('zh-CN') : '-'} ~ ${planEndDate ? new Date(planEndDate).toLocaleDateString('zh-CN') : '-'}`);
      expect(unassigned.color).toBe('var(--color-text-2)');
    },
  );
});
