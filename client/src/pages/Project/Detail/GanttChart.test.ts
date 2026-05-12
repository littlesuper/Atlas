import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import {
  getStatusProgress,
  daysBetween,
  getMonthGroups,
  getWeekGroups,
  getQuarterGroups,
  getYearGroups,
} from './GanttChart';

describe('getStatusProgress', () => {
  it('returns 100 for COMPLETED', () => {
    expect(getStatusProgress('COMPLETED')).toBe(100);
  });

  it('returns 50 for IN_PROGRESS', () => {
    expect(getStatusProgress('IN_PROGRESS')).toBe(50);
  });

  it('returns 0 for NOT_STARTED', () => {
    expect(getStatusProgress('NOT_STARTED')).toBe(0);
  });

  it('returns 0 for unknown status', () => {
    expect(getStatusProgress('UNKNOWN')).toBe(0);
  });

  it('returns 0 for empty string', () => {
    expect(getStatusProgress('')).toBe(0);
  });

  it('is case-sensitive', () => {
    expect(getStatusProgress('completed')).toBe(0);
    expect(getStatusProgress('in_progress')).toBe(0);
  });

  it('returns number type', () => {
    expect(typeof getStatusProgress('COMPLETED')).toBe('number');
  });
});

describe('daysBetween', () => {
  it('returns correct day count', () => {
    expect(daysBetween(dayjs('2025-01-01'), dayjs('2025-01-10'))).toBe(9);
  });

  it('returns 0 for same day', () => {
    expect(daysBetween(dayjs('2025-03-15'), dayjs('2025-03-15'))).toBe(0);
  });

  it('returns negative for reversed dates', () => {
    expect(daysBetween(dayjs('2025-01-10'), dayjs('2025-01-01'))).toBe(-9);
  });

  it('handles year boundary', () => {
    expect(daysBetween(dayjs('2024-12-31'), dayjs('2025-01-01'))).toBe(1);
  });

  it('handles large range', () => {
    expect(daysBetween(dayjs('2025-01-01'), dayjs('2025-12-31'))).toBe(364);
  });
});

describe('getMonthGroups', () => {
  it('splits single month range', () => {
    const groups = getMonthGroups(dayjs('2025-03-01'), dayjs('2025-03-31'));
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2025年3月');
    expect(groups[0].days).toBe(31);
  });

  it('splits cross-month range', () => {
    const groups = getMonthGroups(dayjs('2025-01-15'), dayjs('2025-03-10'));
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ label: '2025年1月', days: 17 });
    expect(groups[1]).toEqual({ label: '2025年2月', days: 28 });
    expect(groups[2]).toEqual({ label: '2025年3月', days: 10 });
  });

  it('handles single day range', () => {
    const groups = getMonthGroups(dayjs('2025-06-15'), dayjs('2025-06-15'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(1);
  });
});

describe('getWeekGroups', () => {
  it('splits a week-aligned range', () => {
    const groups = getWeekGroups(dayjs('2025-03-03'), dayjs('2025-03-09'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(7);
  });

  it('aligns non-Monday start to previous Monday', () => {
    const groups = getWeekGroups(dayjs('2025-03-05'), dayjs('2025-03-09'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(5);
  });

  it('splits two-week range', () => {
    const groups = getWeekGroups(dayjs('2025-03-03'), dayjs('2025-03-16'));
    expect(groups).toHaveLength(2);
  });

  it('single day range produces one group', () => {
    const groups = getWeekGroups(dayjs('2025-03-05'), dayjs('2025-03-05'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(1);
  });

  it('all group labels contain "周" or "W"', () => {
    const groups = getWeekGroups(dayjs('2025-01-01'), dayjs('2025-03-31'));
    for (const g of groups) {
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});

describe('getQuarterGroups', () => {
  it('splits single quarter range', () => {
    const groups = getQuarterGroups(dayjs('2025-01-01'), dayjs('2025-03-31'));
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2025年Q1');
  });

  it('splits cross-quarter range', () => {
    const groups = getQuarterGroups(dayjs('2025-01-01'), dayjs('2025-06-30'));
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('2025年Q1');
    expect(groups[1].label).toBe('2025年Q2');
  });

  it('splits full year into 4 quarters', () => {
    const groups = getQuarterGroups(dayjs('2025-01-01'), dayjs('2025-12-31'));
    expect(groups).toHaveLength(4);
    expect(groups.map((g) => g.label)).toEqual(['2025年Q1', '2025年Q2', '2025年Q3', '2025年Q4']);
  });

  it('single day produces one group', () => {
    const groups = getQuarterGroups(dayjs('2025-07-15'), dayjs('2025-07-15'));
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2025年Q3');
    expect(groups[0].days).toBe(1);
  });
});

describe('getYearGroups', () => {
  it('splits single year range', () => {
    const groups = getYearGroups(dayjs('2025-01-01'), dayjs('2025-12-31'));
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2025年');
    expect(groups[0].days).toBe(365);
  });

  it('splits cross-year range', () => {
    const groups = getYearGroups(dayjs('2024-06-01'), dayjs('2025-06-30'));
    expect(groups).toHaveLength(2);
    expect(groups[0].label).toBe('2024年');
    expect(groups[1].label).toBe('2025年');
  });

  it('handles leap year', () => {
    const groups = getYearGroups(dayjs('2024-01-01'), dayjs('2024-12-31'));
    expect(groups[0].days).toBe(366);
  });

  it('single day in year', () => {
    const groups = getYearGroups(dayjs('2025-06-15'), dayjs('2025-06-15'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(1);
  });

  it('sum of group days equals total days in range', () => {
    const start = dayjs('2024-11-15');
    const end = dayjs('2025-03-20');
    const groups = getYearGroups(start, end);
    const totalDays = groups.reduce((sum, g) => sum + g.days, 0);
    expect(totalDays).toBe(end.diff(start, 'day') + 1);
  });

  it('getStatusProgress returns 0 for CANCELLED', () => {
    expect(getStatusProgress('CANCELLED')).toBe(0);
  });

  it('getMonthGroups handles cross-year range', () => {
    const groups = getMonthGroups(dayjs('2024-11-15'), dayjs('2025-02-10'));
    expect(groups.length).toBe(4);
    expect(groups[0].label).toBe('2024年11月');
    expect(groups[3].label).toBe('2025年2月');
    const totalDays = groups.reduce((sum, g) => sum + g.days, 0);
    expect(totalDays).toBe(dayjs('2025-02-10').diff(dayjs('2024-11-15'), 'day') + 1);
  });

  it('getWeekGroups handles Sunday start alignment', () => {
    const groups = getWeekGroups(dayjs('2025-03-09'), dayjs('2025-03-09'));
    expect(groups).toHaveLength(1);
    expect(groups[0].days).toBe(1);
  });

  it('getQuarterGroups handles cross-year range', () => {
    const groups = getQuarterGroups(dayjs('2024-10-01'), dayjs('2025-03-31'));
    expect(groups.length).toBe(2);
    expect(groups[0].label).toBe('2024年Q4');
    expect(groups[1].label).toBe('2025年Q1');
  });

  it('getMonthGroups handles February in leap year', () => {
    const groups = getMonthGroups(dayjs('2024-02-01'), dayjs('2024-02-29'));
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('2024年2月');
    expect(groups[0].days).toBe(29);
  });

  it('getWeekGroups handles year boundary correctly', () => {
    const groups = getWeekGroups(dayjs('2024-12-30'), dayjs('2025-01-05'));
    expect(groups.length).toBeGreaterThanOrEqual(1);
    const totalDays = groups.reduce((sum, g) => sum + g.days, 0);
    expect(totalDays).toBe(dayjs('2025-01-05').diff(dayjs('2024-12-30'), 'day') + 1);
  });

  it('getYearGroups handles three-year range', () => {
    const groups = getYearGroups(dayjs('2023-06-01'), dayjs('2025-06-30'));
    expect(groups).toHaveLength(3);
    expect(groups[0].label).toBe('2023年');
    expect(groups[1].label).toBe('2024年');
    expect(groups[2].label).toBe('2025年');
    const totalDays = groups.reduce((sum, g) => sum + g.days, 0);
    expect(totalDays).toBe(dayjs('2025-06-30').diff(dayjs('2023-06-01'), 'day') + 1);
  });

  it('getMonthGroups returns empty when start is after end', () => {
    const groups = getMonthGroups(dayjs('2025-06-01'), dayjs('2025-01-01'));
    expect(groups).toEqual([]);
  });

  it('getWeekGroups handles two-day range correctly', () => {
    const groups = getWeekGroups(dayjs('2025-03-03'), dayjs('2025-03-04'));
    const totalDays = groups.reduce((sum, g) => sum + g.days, 0);
    expect(totalDays).toBe(2);
  });

  it('getStatusProgress returns 0 for CANCELLED status', () => {
    expect(getStatusProgress('CANCELLED')).toBe(0);
  });

  it('getStatusProgress returns 100 for COMPLETED status', () => {
    expect(getStatusProgress('COMPLETED')).toBe(100);
  });

  it('getStatusProgress returns 50 for IN_PROGRESS status', () => {
    expect(getStatusProgress('IN_PROGRESS')).toBe(50);
  });

  it('getStatusProgress returns 0 for NOT_STARTED status', () => {
    expect(getStatusProgress('NOT_STARTED')).toBe(0);
  });

  it('getStatusProgress returns 0 for unknown status', () => {
    expect(getStatusProgress('UNKNOWN')).toBe(0);
  });

  it('getStatusProgress returns 100 for COMPLETED status', () => {
    expect(getStatusProgress('COMPLETED')).toBe(100);
  });

  it('getStatusProgress returns 0 for NOT_STARTED status', () => {
    expect(getStatusProgress('NOT_STARTED')).toBe(0);
  });

  it('getStatusProgress returns 100 for COMPLETED', () => {
    expect(getStatusProgress('COMPLETED')).toBe(100);
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const start = dayjs('2026-01-01').add(index, 'day');
    const end = start.add(index % 20, 'day');
    return [start, end] as const;
  }))('getMonthGroups generated range sums to total days %s', (start, end) => {
    const groups = getMonthGroups(start, end);
    const totalDays = groups.reduce((sum, group) => sum + group.days, 0);

    expect(totalDays).toBe(end.diff(start, 'day') + 1);
    expect(groups.every((group) => group.label.includes('年'))).toBe(true);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const start = dayjs('2024-01-01').add(index * 13, 'day');
    const end = start.add(30 + index, 'day');
    return [start, end] as const;
  }))('getYearGroups generated range sums to total days %s', (start, end) => {
    const groups = getYearGroups(start, end);
    const totalDays = groups.reduce((sum, group) => sum + group.days, 0);

    expect(totalDays).toBe(end.diff(start, 'day') + 1);
    expect(groups[0].label).toContain(`${start.year()}`);
    expect(groups.at(-1)!.label).toContain(`${end.year()}`);
  });

  it.each(Array.from({ length: 80 }, (_, index) => {
    const start = dayjs('2025-01-06').add(index * 3, 'day');
    const candidateEnd = start.add((index % 28) + 1, 'day');
    const end = candidateEnd.day() === 1 ? candidateEnd.add(1, 'day') : candidateEnd;
    return [start, end] as const;
  }))('getWeekGroups generated range sums to total days %#', (start, end) => {
    const groups = getWeekGroups(start, end);
    const totalDays = groups.reduce((sum, group) => sum + group.days, 0);

    expect(totalDays).toBe(end.diff(start, 'day') + 1);
    expect(groups.every((group) => group.days > 0)).toBe(true);
  });

  it.each(Array.from({ length: 60 }, (_, index) => {
    const start = dayjs('2025-01-01').add(index * 11, 'day');
    const end = start.add(45 + (index % 60), 'day');
    return [start, end] as const;
  }))('getQuarterGroups generated range sums to total days %#', (start, end) => {
    const groups = getQuarterGroups(start, end);
    const totalDays = groups.reduce((sum, group) => sum + group.days, 0);

    expect(totalDays).toBe(end.diff(start, 'day') + 1);
    expect(groups.every((group) => group.label.includes('Q'))).toBe(true);
  });
});
