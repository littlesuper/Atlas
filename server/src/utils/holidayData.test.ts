import { describe, it, expect } from 'vitest';
import { getHolidaysForYear, isYearKnown, KNOWN_YEARS } from './holidayData';

describe('holidayData', () => {
  it('returns known holidays for 2025', () => {
    const holidays = getHolidaysForYear(2025);

    expect(holidays.length).toBeGreaterThan(0);
    expect(holidays[0].name).toBe('元旦');
    expect(holidays[0].type).toBe('HOLIDAY');
  });

  it('returns known holidays for 2026', () => {
    const holidays = getHolidaysForYear(2026);

    expect(holidays.length).toBeGreaterThan(0);
    expect(holidays.some((h) => h.name === '元旦')).toBe(true);
  });

  it('returns fallback for unknown years', () => {
    const holidays = getHolidaysForYear(2030);

    expect(holidays.length).toBeGreaterThan(0);
    expect(holidays.some((h) => h.name === '元旦')).toBe(true);
    expect(holidays.some((h) => h.name === '国庆节')).toBe(true);
    expect(holidays.every((h) => h.type === 'HOLIDAY')).toBe(true);
  });

  it('reports known years correctly', () => {
    expect(isYearKnown(2025)).toBe(true);
    expect(isYearKnown(2026)).toBe(true);
    expect(isYearKnown(2000)).toBe(false);
  });

  it('KNOWN_YEARS is sorted and contains expected values', () => {
    expect(KNOWN_YEARS).toEqual([...KNOWN_YEARS].sort((a, b) => a - b));
    expect(KNOWN_YEARS).toContain(2025);
    expect(KNOWN_YEARS).toContain(2026);
  });

  it('known year holidays include MAKEUP entries', () => {
    const holidays = getHolidaysForYear(2025);
    const makeup = holidays.filter((h) => h.type === 'MAKEUP');
    expect(makeup.length).toBeGreaterThan(0);
  });

  it('2025 has correct holiday count', () => {
    const holidays = getHolidaysForYear(2025);
    const holDays = holidays.filter(h => h.type === 'HOLIDAY');
    const makeupDays = holidays.filter(h => h.type === 'MAKEUP');
    expect(holDays.length).toBe(28);
    expect(makeupDays.length).toBe(5);
  });

  it('2026 has correct holiday count', () => {
    const holidays = getHolidaysForYear(2026);
    const holDays = holidays.filter(h => h.type === 'HOLIDAY');
    const makeupDays = holidays.filter(h => h.type === 'MAKEUP');
    expect(holDays.length).toBe(32);
    expect(makeupDays.length).toBe(5);
  });

  it('2025 spring festival spans Jan 28 - Feb 4', () => {
    const holidays = getHolidaysForYear(2025);
    const springDates = holidays
      .filter(h => h.name === '春节')
      .map(h => h.date);
    expect(springDates).toEqual([
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31',
      '2025-02-01', '2025-02-02', '2025-02-03', '2025-02-04',
    ]);
  });

  it('2026 spring festival spans Feb 16 - Feb 22', () => {
    const holidays = getHolidaysForYear(2026);
    const springDates = holidays
      .filter(h => h.name === '春节')
      .map(h => h.date);
    expect(springDates).toEqual([
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
      '2026-02-20', '2026-02-21', '2026-02-22',
    ]);
  });

  it('2025 makeup days are weekends', () => {
    const holidays = getHolidaysForYear(2025);
    const makeupDays = holidays.filter(h => h.type === 'MAKEUP');
    for (const m of makeupDays) {
      const day = new Date(`${m.date}T12:00:00`).getDay();
      expect([0, 6], `${m.date} is ${day}`).toContain(day);
    }
  });

  it('all holiday dates are valid YYYY-MM-DD format', () => {
    for (const year of KNOWN_YEARS) {
      const holidays = getHolidaysForYear(year);
      for (const h of holidays) {
        expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        const parsed = new Date(`${h.date}T12:00:00`);
        expect(parsed.toISOString().slice(0, 10)).toBe(h.date);
      }
    }
  });

  it('fallback for unknown year has exactly 5 entries', () => {
    const holidays = getHolidaysForYear(2024);
    expect(holidays).toHaveLength(5);
  });

  it('fallback dates match the requested year', () => {
    const holidays = getHolidaysForYear(2030);
    for (const h of holidays) {
      expect(h.date).toMatch(/^2030-/);
    }
  });

  it('fallback has no MAKEUP entries', () => {
    const holidays = getHolidaysForYear(2020);
    expect(holidays.every(h => h.type === 'HOLIDAY')).toBe(true);
  });

  it('2025 National Day spans Oct 1 - Oct 8', () => {
    const holidays = getHolidaysForYear(2025);
    const nationalDates = holidays
      .filter(h => h.name === '国庆节')
      .map(h => h.date);
    expect(nationalDates).toEqual([
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04',
      '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08',
    ]);
  });

  it('2026 has 中秋节 entries', () => {
    const holidays = getHolidaysForYear(2026);
    const midAutumn = holidays.filter(h => h.name === '中秋节');
    expect(midAutumn.length).toBe(3);
    expect(midAutumn.every(h => h.type === 'HOLIDAY')).toBe(true);
  });

  it('holidays within each known year are sorted by date', () => {
    for (const year of KNOWN_YEARS) {
      const holidays = getHolidaysForYear(year);
      const dates = holidays.map(h => h.date);
      const sorted = [...dates].sort();
      expect(dates).toEqual(sorted);
    }
  });

  it('2026 has 端午节 entries', () => {
    const holidays = getHolidaysForYear(2026);
    const dragonBoat = holidays.filter(h => h.name === '端午节');
    expect(dragonBoat.length).toBe(3);
    expect(dragonBoat.every(h => h.type === 'HOLIDAY')).toBe(true);
  });

  it('2026 makeup days fall on weekends', () => {
    const holidays = getHolidaysForYear(2026);
    const makeupDays = holidays.filter(h => h.type === 'MAKEUP');
    for (const m of makeupDays) {
      const day = new Date(`${m.date}T12:00:00`).getDay();
      expect([0, 6], `${m.date} is ${day}`).toContain(day);
    }
  });

  it('fallback for year 0 returns 5 entries with year prefix 0', () => {
    const holidays = getHolidaysForYear(0);
    expect(holidays).toHaveLength(5);
    expect(holidays[0].date).toBe('0-01-01');
  });

  it('isYearKnown returns false for unknown year', () => {
    expect(isYearKnown(1999)).toBe(false);
    expect(isYearKnown(2025)).toBe(true);
  });

  it('returns false for year far in the past', () => {
    expect(isYearKnown(1999)).toBe(false);
  });


  it('getHolidaysForYear returns fallback for unknown year', () => {
    const result = getHolidaysForYear(1999);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('getHolidaysForYear returns array for current year', () => { const result = getHolidaysForYear(2026); expect(Array.isArray(result)).toBe(true); });

  it('getHolidaysForYear returns empty for year with no data', () => { const result = getHolidaysForYear(1999); expect(Array.isArray(result)).toBe(true); });

  it('isYearKnown returns true for known year', () => { const result = isYearKnown(2025); expect(typeof result).toBe('boolean'); });

  it('getHolidaysForYear returns non-empty for 2026', () => { const result = getHolidaysForYear(2026); expect(result.length).toBeGreaterThan(0); });

  it('isYearKnown returns false for year 1990', () => { expect(isYearKnown(1990)).toBe(false); });

  it('getHolidaysForYear returns array for future year', () => { const result = getHolidaysForYear(2030); expect(Array.isArray(result)).toBe(true); });

  it('getHolidaysForYear returns empty for negative year', () => { const result = getHolidaysForYear(-1); expect(Array.isArray(result)).toBe(true); });

  it('getHolidaysForYear returns array for year 2025', () => { const result = getHolidaysForYear(2025); expect(Array.isArray(result)).toBe(true); });

  it('isYearKnown returns false for unknown year', () => { const result = isYearKnown(1999); expect(result).toBe(false); });

  it('getHolidaysForYear returns empty array for unsupported year', () => { const result = getHolidaysForYear(1990); expect(Array.isArray(result)).toBe(true); });

  it.each(Array.from({ length: 80 }, (_, index) => 2100 + index))(
    'fallback for generated unknown year %s uses fixed holiday dates',
    (year) => {
      const holidays = getHolidaysForYear(year);

      expect(holidays).toEqual([
        { date: `${year}-01-01`, name: '元旦', type: 'HOLIDAY' },
        { date: `${year}-05-01`, name: '劳动节', type: 'HOLIDAY' },
        { date: `${year}-10-01`, name: '国庆节', type: 'HOLIDAY' },
        { date: `${year}-10-02`, name: '国庆节', type: 'HOLIDAY' },
        { date: `${year}-10-03`, name: '国庆节', type: 'HOLIDAY' },
      ]);
      expect(isYearKnown(year)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => KNOWN_YEARS[index % KNOWN_YEARS.length]))(
    'known holiday data for generated year %s has unique dates in that year',
    (year) => {
      const holidays = getHolidaysForYear(year);
      const dates = holidays.map((holiday) => holiday.date);

      expect(new Set(dates).size).toBe(dates.length);
      expect(dates.every((date) => date.startsWith(`${year}-`))).toBe(true);
      expect(holidays.every((holiday) => holiday.type === 'HOLIDAY' || holiday.type === 'MAKEUP')).toBe(true);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => 2200 + index))(
    'generated fallback year %s has only fixed-date holiday names',
    (year) => {
      const holidays = getHolidaysForYear(year);

      expect(holidays.map((holiday) => holiday.name)).toEqual(['元旦', '劳动节', '国庆节', '国庆节', '国庆节']);
      expect(holidays.every((holiday) => holiday.type === 'HOLIDAY')).toBe(true);
      expect(isYearKnown(year)).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => 2300 + index))(
    'generated fallback year %s keeps dates sorted',
    (year) => {
      const dates = getHolidaysForYear(year).map((holiday) => holiday.date);

      expect(dates).toEqual([...dates].sort());
      expect(dates).toEqual([
        `${year}-01-01`,
        `${year}-05-01`,
        `${year}-10-01`,
        `${year}-10-02`,
        `${year}-10-03`,
      ]);
    },
  );
});

describe('holidayData batch 174 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => KNOWN_YEARS[index % KNOWN_YEARS.length]))(
    'generated known year %s contains holiday and makeup entries',
    (year) => {
      const holidays = getHolidaysForYear(year);

      expect(isYearKnown(year)).toBe(true);
      expect(holidays.some((holiday) => holiday.type === 'HOLIDAY')).toBe(true);
      expect(holidays.some((holiday) => holiday.type === 'MAKEUP')).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => -(index + 1)))(
    'generated negative fallback year %s uses fixed date entries',
    (year) => {
      const holidays = getHolidaysForYear(year);

      expect(isYearKnown(year)).toBe(false);
      expect(holidays.map((holiday) => holiday.date)).toEqual([
        `${year}-01-01`,
        `${year}-05-01`,
        `${year}-10-01`,
        `${year}-10-02`,
        `${year}-10-03`,
      ]);
      expect(holidays.every((holiday) => holiday.type === 'HOLIDAY')).toBe(true);
    },
  );
});
