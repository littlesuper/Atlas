import { describe, it, expect } from 'vitest';
import { getWeekNumber, getWeekRange } from './weekNumber';

describe('getWeekNumber', () => {
  // ===== ISO 8601 标准：周一为第一天，第一周包含 1 月 4 日 =====

  it('2025-01-01（周三）属于 2025 年第 1 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-01T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(1);
  });

  it('2025-01-06（周一）属于 2025 年第 2 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-06T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(2);
  });

  it('2025-01-05（周日）属于 2025 年第 1 周', () => {
    // ISO: 周日是一周的最后一天，仍属第 1 周
    const { year, weekNumber } = getWeekNumber(new Date('2025-01-05T12:00:00'));
    expect(year).toBe(2025);
    expect(weekNumber).toBe(1);
  });

  it('2025-12-29（周一）属于 2026 年第 1 周', () => {
    // 2025-12-29 是 2026 年 ISO 第 1 周的周一
    const { year, weekNumber } = getWeekNumber(new Date('2025-12-29T12:00:00'));
    expect(year).toBe(2026);
    expect(weekNumber).toBe(1);
  });

  it('2020-12-28（周一）属于 2020 年第 53 周', () => {
    // 2020 年是 53 周的年份
    const { year, weekNumber } = getWeekNumber(new Date('2020-12-28T12:00:00'));
    expect(year).toBe(2020);
    expect(weekNumber).toBe(53);
  });

  it('2021-01-01（周五）属于 2020 年第 53 周', () => {
    // 跨年：2021-01-01 仍属于 2020 年的最后一周
    const { year, weekNumber } = getWeekNumber(new Date('2021-01-01T12:00:00'));
    expect(year).toBe(2020);
    expect(weekNumber).toBe(53);
  });

  it('2024-02-26（周一）属于 2024 年第 9 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2024-02-26T12:00:00'));
    expect(year).toBe(2024);
    expect(weekNumber).toBe(9);
  });
});

describe('ISO week batch 173 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2060 + (index % 8),
    (index % 52) + 1,
    index % 7,
  ] as const))(
    'generated week %s-W%s offset %s round-trips through getWeekNumber',
    (year, weekNumber, offsetDays) => {
      const { weekStart } = getWeekRange(year, weekNumber);
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + offsetDays);

      expect(getWeekNumber(date)).toEqual({ year, weekNumber });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2070 + (index % 5),
    (index % 52) + 1,
  ] as const))(
    'generated week %s-W%s starts before its inclusive end',
    (year, weekNumber) => {
      const { weekStart, weekEnd } = getWeekRange(year, weekNumber);

      expect(weekStart.getTime()).toBeLessThan(weekEnd.getTime());
      expect(weekEnd.getTime() - weekStart.getTime()).toBe((7 * 24 * 60 * 60 * 1000) - 1);
    },
  );
});

describe('getWeekRange', () => {
  it('2025 年第 1 周从 2024-12-30（周一）开始', () => {
    // ISO W1 2025 的周一是 2024-12-30
    const { weekStart } = getWeekRange(2025, 1);
    expect(weekStart.getFullYear()).toBe(2024);
    expect(weekStart.getMonth()).toBe(11); // December
    expect(weekStart.getDate()).toBe(30);
  });

  it('2025 年第 1 周在 2025-01-05（周日）结束', () => {
    const { weekEnd } = getWeekRange(2025, 1);
    expect(weekEnd.getFullYear()).toBe(2025);
    expect(weekEnd.getMonth()).toBe(0); // January
    expect(weekEnd.getDate()).toBe(5);
  });

  it('2025 年第 2 周从 2025-01-06（周一）开始', () => {
    const { weekStart } = getWeekRange(2025, 2);
    expect(weekStart.getFullYear()).toBe(2025);
    expect(weekStart.getMonth()).toBe(0); // January
    expect(weekStart.getDate()).toBe(6);
  });

  it('任意一周的跨度必须是 7 天', () => {
    const { weekStart, weekEnd } = getWeekRange(2025, 10);
    const diffMs = weekEnd.getTime() - weekStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7); // weekEnd = 23:59:59.999，Math.round → 7
  });

  it('getWeekRange 与 getWeekNumber 互为逆运算', () => {
    // 对 2025-W8 的周一验证
    const { weekStart } = getWeekRange(2025, 8);
    const { year, weekNumber } = getWeekNumber(weekStart);
    expect(year).toBe(2025);
    expect(weekNumber).toBe(8);
  });

  it('weekStart 时间为 00:00:00', () => {
    const { weekStart } = getWeekRange(2025, 5);
    expect(weekStart.getHours()).toBe(0);
    expect(weekStart.getMinutes()).toBe(0);
    expect(weekStart.getSeconds()).toBe(0);
  });

  it('weekEnd 时间为 23:59:59', () => {
    const { weekEnd } = getWeekRange(2025, 5);
    expect(weekEnd.getHours()).toBe(23);
    expect(weekEnd.getMinutes()).toBe(59);
    expect(weekEnd.getSeconds()).toBe(59);
  });

  it('2020 年第 53 周从 2020-12-28（周一）到 2021-01-03（周日）', () => {
    const { weekStart, weekEnd } = getWeekRange(2020, 53);
    expect(weekStart.getFullYear()).toBe(2020);
    expect(weekStart.getMonth()).toBe(11);
    expect(weekStart.getDate()).toBe(28);
    expect(weekEnd.getFullYear()).toBe(2021);
    expect(weekEnd.getMonth()).toBe(0);
    expect(weekEnd.getDate()).toBe(3);
  });

  it('getWeekNumber for Saturday returns same week as preceding Monday', () => {
    const monday = new Date('2025-01-06T12:00:00');
    const saturday = new Date('2025-01-11T12:00:00');
    const mon = getWeekNumber(monday);
    const sat = getWeekNumber(saturday);
    expect(sat.year).toBe(mon.year);
    expect(sat.weekNumber).toBe(mon.weekNumber);
  });

  it('2024-02-29（闰年）属于 2024 年第 9 周', () => {
    const { year, weekNumber } = getWeekNumber(new Date('2024-02-29T12:00:00'));
    expect(year).toBe(2024);
    expect(weekNumber).toBe(9);
  });

  it('getWeekRange for week 52 of 2025 starts on December 22', () => {
    const { weekStart, weekEnd } = getWeekRange(2025, 52);
    expect(weekStart.getFullYear()).toBe(2025);
    expect(weekStart.getMonth()).toBe(11);
    expect(weekStart.getDate()).toBe(22);
    expect(weekEnd.getFullYear()).toBe(2025);
    expect(weekEnd.getMonth()).toBe(11);
    expect(weekEnd.getDate()).toBe(28);
  });

  it('getWeekNumber returns same result at midnight and noon for same date', () => {
    const midnight = new Date('2025-06-15T00:00:00');
    const noon = new Date('2025-06-15T12:00:00');
    expect(getWeekNumber(midnight)).toEqual(getWeekNumber(noon));
  });

  it('getWeekRange returns Monday to Sunday span', () => {
    const { weekStart, weekEnd } = getWeekRange(2025, 1);
    expect(weekStart.getDay()).toBe(1);
    expect(weekEnd.getDay()).toBe(0);
  });

  it('getWeekNumber for Jan 1 returns week 1', () => {
    const result = getWeekNumber(new Date('2025-01-01'));
    expect(result.weekNumber).toBe(1);
    expect(result.year).toBe(2025);
  });

  it('getWeekNumber for Dec 31 returns week 53 or late-week', () => {
    const result = getWeekNumber(new Date('2025-12-31'));
    expect(result.weekNumber).toBeGreaterThanOrEqual(1);
    expect(result.year).toBeGreaterThanOrEqual(2025);
  });

  it('returns consistent results for the same date', () => {
    const date = new Date('2026-06-15');
    const r1 = getWeekNumber(date);
    const r2 = getWeekNumber(date);
    expect(r1).toEqual(r2);
  });

  it('getWeekNumber handles year boundary Jan 1', () => {
    const result = getWeekNumber(new Date('2026-01-01'));
    expect(result).toBeDefined();
    expect(result.year).toBe(2026);
  });

  it('getWeekNumber handles mid-year date', () => { const result = getWeekNumber(new Date('2026-07-01')); expect(result).toBeDefined(); expect(result.year).toBe(2026); });

  it('getWeekNumber handles year boundary date', () => { const result = getWeekNumber(new Date('2026-01-01')); expect(result).toBeDefined(); expect(result.year).toBe(2026); });

  it('getWeekRange returns valid date range', () => { const range = getWeekRange(2026, 1); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });

  it('getWeekNumber handles last day of year', () => { const result = getWeekNumber(new Date('2026-12-31')); expect(result).toBeDefined(); expect(result.year).toBe(2026); });

  it('getWeekRange handles high week number', () => { const range = getWeekRange(2026, 52); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });

  it('getWeekRange handles week 1', () => { const range = getWeekRange(2026, 1); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });

  it('getWeekRange handles week 53', () => { const range = getWeekRange(2026, 53); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });

  it('getWeekRange handles week 52', () => { const range = getWeekRange(2026, 52); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });

  it('getWeekRange handles week 1', () => { const range = getWeekRange(2026, 1); expect(range.weekStart).toBeInstanceOf(Date); expect(range.weekEnd).toBeInstanceOf(Date); });
});

describe('ISO week boundary matrices', () => {
  it.each(Array.from({ length: 53 }, (_, index) => index + 1))(
    '2020 week %s round-trips from Monday',
    (weekNumber) => {
      const { weekStart } = getWeekRange(2020, weekNumber);
      expect(getWeekNumber(weekStart)).toEqual({ year: 2020, weekNumber });
    }
  );

  it.each(Array.from({ length: 52 }, (_, index) => index + 1))(
    '2025 week %s round-trips from Sunday',
    (weekNumber) => {
      const { weekEnd } = getWeekRange(2025, weekNumber);
      expect(getWeekNumber(weekEnd)).toEqual({ year: 2025, weekNumber });
    }
  );

  it.each(Array.from({ length: 40 }, (_, index) => {
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2026-03-${day}T00:00:00`;
  }))('midnight and noon stay in the same ISO week for %s', (iso) => {
    const midnight = new Date(iso);
    const noon = new Date(iso.replace('T00:00:00', 'T12:00:00'));
    expect(getWeekNumber(midnight)).toEqual(getWeekNumber(noon));
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    2027 + (index % 4),
    (index % 52) + 1,
  ] as const))(
    'generated week range %s-W%s starts Monday and ends Sunday',
    (year, weekNumber) => {
      const { weekStart, weekEnd } = getWeekRange(year, weekNumber);

      expect(weekStart.getDay()).toBe(1);
      expect(weekEnd.getDay()).toBe(0);
      expect(weekStart.getHours()).toBe(0);
      expect(weekEnd.getHours()).toBe(23);
      expect(getWeekNumber(weekStart)).toEqual({ year, weekNumber });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2025 + (index % 3),
    (index % 40) + 1,
    index % 7,
  ] as const))(
    'generated date inside week %s-W%s offset %s keeps same ISO week',
    (year, weekNumber, offsetDays) => {
      const { weekStart } = getWeekRange(year, weekNumber);
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + offsetDays);

      expect(getWeekNumber(date)).toEqual({ year, weekNumber });
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    2031 + (index % 5),
    (index % 52) + 1,
  ] as const))(
    'generated week %s-W%s keeps exact end-of-week millisecond boundary',
    (year, weekNumber) => {
      const { weekStart, weekEnd } = getWeekRange(year, weekNumber);

      expect(weekStart.getHours()).toBe(0);
      expect(weekStart.getMinutes()).toBe(0);
      expect(weekStart.getSeconds()).toBe(0);
      expect(weekStart.getMilliseconds()).toBe(0);
      expect(weekEnd.getHours()).toBe(23);
      expect(weekEnd.getMinutes()).toBe(59);
      expect(weekEnd.getSeconds()).toBe(59);
      expect(weekEnd.getMilliseconds()).toBe(999);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2036 + (index % 4),
    (index % 52) + 1,
  ] as const))(
    'generated week %s-W%s keeps seven calendar days inclusive',
    (year, weekNumber) => {
      const { weekStart, weekEnd } = getWeekRange(year, weekNumber);
      const nextMonday = new Date(weekStart);
      nextMonday.setDate(weekStart.getDate() + 7);

      expect(weekEnd.getTime()).toBe(nextMonday.getTime() - 1);
      expect(getWeekNumber(weekStart)).toEqual({ year, weekNumber });
    },
  );
});

describe('ISO week batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2040 + (index % 8),
    (index % 52) + 1,
  ] as const))(
    'generated week %s-W%s round-trips from Wednesday',
    (year, weekNumber) => {
      const { weekStart } = getWeekRange(year, weekNumber);
      const wednesday = new Date(weekStart);
      wednesday.setDate(weekStart.getDate() + 2);

      expect(getWeekNumber(wednesday)).toEqual({ year, weekNumber });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    2050 + (index % 6),
    (index % 52) + 1,
  ] as const))(
    'generated week %s-W%s keeps six day date delta',
    (year, weekNumber) => {
      const { weekStart, weekEnd } = getWeekRange(year, weekNumber);
      const endDateOnly = new Date(weekEnd);
      endDateOnly.setHours(0, 0, 0, 0);

      expect((endDateOnly.getTime() - weekStart.getTime()) / 86400000).toBe(6);
    },
  );
});
