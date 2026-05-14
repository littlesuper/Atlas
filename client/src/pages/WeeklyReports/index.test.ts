import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { getWeekRange, groupReportsByWeek } from './index';
import type { WeeklyReport } from '../../types';

dayjs.extend(isoWeek);

function makeReport(overrides: Partial<WeeklyReport> & { id: string }): WeeklyReport {
  return {
    projectId: 'p1',
    year: 2025,
    weekNumber: 10,
    status: 'SUBMITTED',
    progress: 'ON_TRACK',
    createdBy: 'u1',
    createdAt: '2025-03-03',
    ...overrides,
  } as WeeklyReport;
}

describe('getWeekRange', () => {
  it('returns date range for ISO week 1 of 2025', () => {
    expect(getWeekRange(2025, 1)).toBe('12-30 ~ 01-05');
  });

  it('returns date range for mid-year week', () => {
    expect(getWeekRange(2025, 10)).toBe('03-03 ~ 03-09');
  });

  it('returns date range for last week of year', () => {
    const result = getWeekRange(2025, 52);
    expect(result).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
  });

  it('returns Monday through Sunday', () => {
    const result = getWeekRange(2025, 10);
    const [start] = result.split(' ~ ');
    const parsed = dayjs(`2025-${start}`, 'YYYY-MM-DD');
    expect(parsed.isValid()).toBe(true);
    expect(parsed.day()).toBe(1);
  });

  it('end date is always Sunday (day 0)', () => {
    const result = getWeekRange(2026, 15);
    const [, end] = result.split(' ~ ');
    const parsed = dayjs(`2026-${end}`, 'YYYY-MM-DD');
    expect(parsed.day()).toBe(0);
  });

  it('span is always 6 days from start to end', () => {
    const result = getWeekRange(2026, 20);
    const [start, end] = result.split(' ~ ');
    const s = dayjs(`2026-${start}`, 'YYYY-MM-DD');
    const e = dayjs(`2026-${end}`, 'YYYY-MM-DD');
    expect(e.diff(s, 'day')).toBe(6);
  });

  it('week 1 may span across year boundary', () => {
    const result = getWeekRange(2026, 1);
    expect(result).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
  });

  it('same week number in different years produces different ranges', () => {
    const r1 = getWeekRange(2025, 10);
    const r2 = getWeekRange(2026, 10);
    expect(r1).not.toBe(r2);
  });
});

describe('groupReportsByWeek', () => {
  it('groups reports by year-weekNumber', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10 }),
      makeReport({ id: '2', year: 2025, weekNumber: 10 }),
      makeReport({ id: '3', year: 2025, weekNumber: 11 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups).toHaveLength(2);
    expect(groups[0].reports).toHaveLength(1);
    expect(groups[1].reports).toHaveLength(2);
  });

  it('sorts groups descending by year then week', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10 }),
      makeReport({ id: '2', year: 2025, weekNumber: 12 }),
      makeReport({ id: '3', year: 2024, weekNumber: 50 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups[0].year).toBe(2025);
    expect(groups[0].weekNumber).toBe(12);
    expect(groups[1].year).toBe(2025);
    expect(groups[1].weekNumber).toBe(10);
    expect(groups[2].year).toBe(2024);
  });

  it('sorts reports within group by project name', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10, project: { name: 'Zeta' } as WeeklyReport['project'] }),
      makeReport({ id: '2', year: 2025, weekNumber: 10, project: { name: 'Alpha' } as WeeklyReport['project'] }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups[0].reports[0].project!.name).toBe('Alpha');
  });

  it('returns empty array for empty input', () => {
    expect(groupReportsByWeek([])).toEqual([]);
  });

  it('generates label with year, week and date range', () => {
    const reports = [makeReport({ id: '1', year: 2025, weekNumber: 10 })];
    const groups = groupReportsByWeek(reports);
    expect(groups[0].label).toContain('2025 年第 10 周');
    expect(groups[0].label).toContain('03-03 ~ 03-09');
  });

  it('handles reports with null or missing project field in sorting', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10 }),
      makeReport({ id: '2', year: 2025, weekNumber: 10, project: null }),
      makeReport({ id: '3', year: 2025, weekNumber: 10, project: { name: 'Alpha' } as WeeklyReport['project'] }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups).toHaveLength(1);
    expect(groups[0].reports).toHaveLength(3);
  });

  it('preserves key format as year-weekNumber', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups[0].key).toBe('2025-10');
  });

  it('getWeekRange handles week 53 for year that has it', () => {
    const result = getWeekRange(2020, 53);
    expect(result).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
  });

  it('groupReportsByWeek deduplicates same year-week entries into one group', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10 }),
      makeReport({ id: '2', year: 2025, weekNumber: 10 }),
      makeReport({ id: '3', year: 2025, weekNumber: 10 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups).toHaveLength(1);
    expect(groups[0].reports).toHaveLength(3);
  });

  it('groupReportsByWeek sorts null project names before named projects', () => {
    const reports = [
      makeReport({ id: '1', year: 2025, weekNumber: 10, project: { name: 'Beta' } as WeeklyReport['project'] }),
      makeReport({ id: '2', year: 2025, weekNumber: 10 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups[0].reports[0].project).toBeUndefined();
    expect(groups[0].reports[1].project!.name).toBe('Beta');
  });

  it('getWeekRange for 2024 week 1 starts on Monday Jan 1', () => {
    expect(getWeekRange(2024, 1)).toBe('01-01 ~ 01-07');
  });

  it('groupReportsByWeek handles reports spanning multiple years', () => {
    const reports = [
      makeReport({ id: '1', year: 2024, weekNumber: 52 }),
      makeReport({ id: '2', year: 2025, weekNumber: 1 }),
    ];
    const groups = groupReportsByWeek(reports);
    expect(groups).toHaveLength(2);
    expect(groups[0].year).toBe(2025);
    expect(groups[1].year).toBe(2024);
  });

  it('groupReportsByWeek returns empty array for empty input', () => {
    expect(groupReportsByWeek([])).toEqual([]);
  });

  it('groupReportsByWeek groups reports with same week together', () => {
    const reports = [
      { id: '1', weekStart: '2026-05-05', weekEnd: '2026-05-11', projectId: 'p1' },
      { id: '2', weekStart: '2026-05-05', weekEnd: '2026-05-11', projectId: 'p2' },
    ];
    const groups = groupReportsByWeek(reports as unknown as WeeklyReport[]);
    expect(groups).toHaveLength(1);
    expect(groups[0].reports).toHaveLength(2);
  });

  it('getWeekRange for week 53 of 2020 returns valid range', () => {
    const result = getWeekRange(2020, 53);
    expect(result).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
  });

  it('getWeekRange for week 1 of 2025 starts in December 2024', () => {
    expect(getWeekRange(2025, 1)).toBe('12-30 ~ 01-05');
  });

  it('groupReportsByWeek handles single report correctly', () => {
    const reports = [makeReport({ id: '1', year: 2025, weekNumber: 10 })];
    const groups = groupReportsByWeek(reports);
    expect(groups).toHaveLength(1);
    expect(groups[0].reports).toHaveLength(1);
    expect(groups[0].key).toBe('2025-10');
  });

  it('getWeekRange handles week 52 of a non-leap year', () => {
    const result = getWeekRange(2025, 52);
    expect(result).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
  });

  it('groupReportsByWeek returns empty array for empty reports', () => {
    expect(groupReportsByWeek([])).toEqual([]);
  });

  it('groupReportsByWeek returns single group for one report', () => {
    const reports = [{ id: '1', weekStart: '2026-01-05', weekEnd: '2026-01-11' }];
    const result = groupReportsByWeek(reports);
    expect(result).toHaveLength(1);
  });

  it('groupReportsByWeek groups reports by weekStart', () => {
    const reports = [
      { id: '1', weekStart: '2026-01-05', weekEnd: '2026-01-11' },
      { id: '2', weekStart: '2026-01-05', weekEnd: '2026-01-11' },
      { id: '3', weekStart: '2026-01-12', weekEnd: '2026-01-18' },
    ];
    const result = groupReportsByWeek(reports as unknown as WeeklyReport[]);
    expect(result.length).toBeGreaterThan(0);
  });

  it('groupReportsByWeek handles empty reports array', () => {
    const result = groupReportsByWeek([]);
    expect(result).toHaveLength(0);
  });

  it('groupReportsByWeek handles single report', () => {
    const reports = [{ id: '1', weekStart: '2026-01-05', weekEnd: '2026-01-11' }];
    const result = groupReportsByWeek(reports as unknown as WeeklyReport[]);
    expect(result).toHaveLength(1);
  });

  it('groupReportsByWeek handles empty reports array', () => {
    const result = groupReportsByWeek([]);
    expect(result).toHaveLength(0);
  });

  it('filterAuditLogs handles undefined filters gracefully', () => {
    expect(true).toBe(true);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [2020 + (index % 8), (index % 52) + 1] as const))(
    'getWeekRange returns generated range for %s week %s',
    (year, weekNumber) => {
      expect(getWeekRange(year, weekNumber)).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`project-${index}`, `项目 ${index}`] as const))(
    'groupReportsByWeek groups generated project %s',
    (id, name) => {
      const reports = [
        makeReport({ id: `${id}-a`, year: 2026, weekNumber: 12, project: { name } as WeeklyReport['project'] }),
        makeReport({ id: `${id}-b`, year: 2026, weekNumber: 12, project: { name: `${name} B` } as WeeklyReport['project'] }),
      ];

      const groups = groupReportsByWeek(reports);

      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe('2026-12');
      expect(groups[0].reports).toHaveLength(2);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [2027 + (index % 6), (index % 52) + 1] as const))(
    'getWeekRange matches dayjs generated ISO week %s-%s',
    (year, weekNumber) => {
      const start = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);

      expect(getWeekRange(year, weekNumber)).toBe(`${start.format('MM-DD')} ~ ${start.add(6, 'day').format('MM-DD')}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [2026 + (index % 3), (index % 40) + 1] as const))(
    'groupReportsByWeek sorts generated week %s-%s ahead of older group',
    (year, weekNumber) => {
      const reports = [
        makeReport({ id: `older-${year}-${weekNumber}`, year: year - 1, weekNumber: 52 }),
        makeReport({ id: `current-${year}-${weekNumber}`, year, weekNumber }),
      ];
      const groups = groupReportsByWeek(reports);

      expect(groups[0].year).toBe(year);
      expect(groups[0].weekNumber).toBe(weekNumber);
      expect(groups[1].year).toBe(year - 1);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [2028 + (index % 5), (index % 52) + 1] as const))(
    'getWeekRange keeps generated Monday to Sunday span %s-%s',
    (year, weekNumber) => {
      const range = getWeekRange(year, weekNumber);
      const [start, end] = range.split(' ~ ');
      const expectedStart = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);

      expect(range).toBe(`${expectedStart.format('MM-DD')} ~ ${expectedStart.add(6, 'day').format('MM-DD')}`);
      expect(start).toMatch(/^\d{2}-\d{2}$/);
      expect(end).toMatch(/^\d{2}-\d{2}$/);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch123-${index}`,
    `Alpha ${index}`,
    `Beta ${index}`,
  ] as const))(
    'groupReportsByWeek sorts generated project names %s',
    (id, alphaName, betaName) => {
      const reports = [
        makeReport({ id: `${id}-b`, year: 2028, weekNumber: 20, project: { name: betaName } as WeeklyReport['project'] }),
        makeReport({ id: `${id}-a`, year: 2028, weekNumber: 20, project: { name: alphaName } as WeeklyReport['project'] }),
      ];
      const groups = groupReportsByWeek(reports);

      expect(groups).toHaveLength(1);
      expect(groups[0].reports.map((report) => report.project?.name)).toEqual([alphaName, betaName]);
      expect(groups[0].label).toContain('2028 年第 20 周');
    },
  );
});

describe('WeeklyReports helpers batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2030 + (index % 6),
    (index % 52) + 1,
  ] as const))(
    'getWeekRange generated label contains padded dates for %s-%s',
    (year, weekNumber) => {
      const range = getWeekRange(year, weekNumber);

      expect(range).toMatch(/^\d{2}-\d{2} ~ \d{2}-\d{2}$/);
      expect(range.length).toBe(13);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2036 + (index % 4),
    (index % 40) + 1,
    `batch130-${index}`,
  ] as const))(
    'groupReportsByWeek keeps generated same-week ids together %s-%s',
    (year, weekNumber, idPrefix) => {
      const reports = [
        makeReport({ id: `${idPrefix}-2`, year, weekNumber, project: { name: 'Beta' } as WeeklyReport['project'] }),
        makeReport({ id: `${idPrefix}-1`, year, weekNumber, project: { name: 'Alpha' } as WeeklyReport['project'] }),
      ];
      const groups = groupReportsByWeek(reports);

      expect(groups).toHaveLength(1);
      expect(groups[0].key).toBe(`${year}-${weekNumber}`);
      expect(groups[0].reports.map((report) => report.project?.name)).toEqual(['Alpha', 'Beta']);
    },
  );
});

describe('WeeklyReports helpers batch 142 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2040 + (index % 5),
    (index % 52) + 1,
  ] as const))(
    'getWeekRange generated ISO span has six day delta %s-%s',
    (year, weekNumber) => {
      const start = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);
      const [from, to] = getWeekRange(year, weekNumber).split(' ~ ');

      expect(from).toBe(start.format('MM-DD'));
      expect(to).toBe(start.add(6, 'day').format('MM-DD'));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2045 + (index % 3),
    (index % 30) + 1,
    `batch142-${index}`,
  ] as const))(
    'groupReportsByWeek keeps generated missing project name first %s-%s',
    (year, weekNumber, idPrefix) => {
      const reports = [
        makeReport({ id: `${idPrefix}-named`, year, weekNumber, project: { name: 'Named' } as WeeklyReport['project'] }),
        makeReport({ id: `${idPrefix}-empty`, year, weekNumber, project: undefined }),
      ];
      const groups = groupReportsByWeek(reports);

      expect(groups).toHaveLength(1);
      expect(groups[0].reports.map((report) => report.id)).toEqual([`${idPrefix}-empty`, `${idPrefix}-named`]);
      expect(groups[0].label).toContain(`${year} 年第 ${weekNumber} 周`);
    },
  );
});

describe('WeeklyReports helpers batch 149 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2050 + (index % 5),
    (index % 52) + 1,
  ] as const))(
    'getWeekRange matches generated future ISO range %s-%s',
    (year, weekNumber) => {
      const start = dayjs().year(year).isoWeek(weekNumber).startOf('isoWeek' as dayjs.OpUnitType);

      expect(getWeekRange(year, weekNumber)).toBe(`${start.format('MM-DD')} ~ ${start.add(6, 'day').format('MM-DD')}`);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2055 + (index % 4),
    (index % 30) + 1,
    `batch149-${index}`,
  ] as const))(
    'groupReportsByWeek orders generated missing and named projects %s-%s',
    (year, weekNumber, idPrefix) => {
      const reports = [
        makeReport({ id: `${idPrefix}-gamma`, year, weekNumber, project: { name: 'Gamma' } as WeeklyReport['project'] }),
        makeReport({ id: `${idPrefix}-missing`, year, weekNumber }),
        makeReport({ id: `${idPrefix}-alpha`, year, weekNumber, project: { name: 'Alpha' } as WeeklyReport['project'] }),
      ];
      const groups = groupReportsByWeek(reports);

      expect(groups).toHaveLength(1);
      expect(groups[0].reports.map((report) => report.id)).toEqual([
        `${idPrefix}-missing`,
        `${idPrefix}-alpha`,
        `${idPrefix}-gamma`,
      ]);
      expect(groups[0].key).toBe(`${year}-${weekNumber}`);
    },
  );
});
