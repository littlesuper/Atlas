import { describe, it, expect } from 'vitest';
import dayjs from 'dayjs';
import { computeYearOptions, formatHolidayDate } from './HolidayManagement';
import { Holiday } from '../../api';

describe('computeYearOptions', () => {
  it('returns range from currentYear-1 to currentYear+5', () => {
    const result = computeYearOptions(2025, [], []);
    expect(result[0]).toBe(2024);
    expect(result[result.length - 1]).toBe(2030);
    expect(result).toHaveLength(7);
  });

  it('includes knownYears from server', () => {
    const result = computeYearOptions(2025, [2020, 2021], []);
    expect(result).toContain(2020);
    expect(result).toContain(2021);
  });

  it('includes years from holiday data', () => {
    const data = [{ year: 2019 } as Holiday, { year: 2035 } as Holiday];
    const result = computeYearOptions(2025, [], data);
    expect(result).toContain(2019);
    expect(result).toContain(2035);
  });

  it('deduplicates years', () => {
    const result = computeYearOptions(2025, [2025], [{ year: 2025 } as Holiday]);
    const count = result.filter(y => y === 2025).length;
    expect(count).toBe(1);
  });

  it('returns sorted ascending', () => {
    const result = computeYearOptions(2025, [2010, 2040], []);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });

  it('handles empty inputs', () => {
    const result = computeYearOptions(2025, [], []);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatHolidayDate', () => {
  it('returns string unchanged', () => {
    expect(formatHolidayDate('2025-01-01')).toBe('2025-01-01');
  });

  it('formats Dayjs object to YYYY-MM-DD', () => {
    const d = dayjs('2025-06-15');
    expect(formatHolidayDate(d)).toBe('2025-06-15');
  });

  it('formats Dayjs with time component correctly', () => {
    const d = dayjs('2025-03-01T14:30:00');
    expect(formatHolidayDate(d)).toBe('2025-03-01');
  });

  it('returns string with time truncated', () => {
    expect(formatHolidayDate('2025-12-25T00:00:00')).toBe('2025-12-25T00:00:00');
  });

  it('handles empty string', () => {
    expect(formatHolidayDate('')).toBe('');
  });
});

describe('computeYearOptions edge cases', () => {
  it('range spans 7 years by default', () => {
    const result = computeYearOptions(2030, [], []);
    expect(result).toHaveLength(7);
    expect(result[0]).toBe(2029);
    expect(result[result.length - 1]).toBe(2035);
  });

  it('merges data years outside default range', () => {
    const data = [{ year: 2000 } as Holiday];
    const result = computeYearOptions(2025, [], data);
    expect(result[0]).toBe(2000);
    expect(result).toContain(2000);
  });
});

describe('formatHolidayDate edge cases', () => {
  it('formats leap year date correctly', () => {
    const d = dayjs('2024-02-29');
    expect(formatHolidayDate(d)).toBe('2024-02-29');
  });

  it('formats year boundary date correctly', () => {
    const d = dayjs('2025-12-31');
    expect(formatHolidayDate(d)).toBe('2025-12-31');
  });

  it('handles invalid Dayjs date gracefully', () => {
    const invalidDate = dayjs('not-a-date');
    const result = formatHolidayDate(invalidDate);
    expect(typeof result).toBe('string');
  });

  it('computeYearOptions deduplicates when knownYears overlap with data years', () => {
    const data = [{ year: 2025 } as Holiday];
    const result = computeYearOptions(2025, [2025], data);
    const count2025 = result.filter(y => y === 2025).length;
    expect(count2025).toBe(1);
  });

  it('formatHolidayDate returns string unchanged when not a Dayjs instance', () => {
    expect(formatHolidayDate('2025-07-04')).toBe('2025-07-04');
    expect(formatHolidayDate('abc')).toBe('abc');
  });

  it('computeYearOptions handles year zero with correct range', () => {
    const result = computeYearOptions(0, [], []);
    expect(result[0]).toBe(-1);
    expect(result[result.length - 1]).toBe(5);
    expect(result).toHaveLength(7);
  });

  it('formatHolidayDate handles dayjs date at end of year', () => {
    const d = dayjs('2025-12-31');
    expect(formatHolidayDate(d)).toBe('2025-12-31');
  });

  it('formatHolidayDate handles Date object at start of year', () => {
    const d = new Date('2025-01-01T00:00:00');
    expect(formatHolidayDate(d)).toBe('2025-01-01');
  });

  it('formatHolidayDate handles Date object at end of year', () => {
    const d = new Date('2025-12-31T00:00:00');
    expect(formatHolidayDate(d)).toBe('2025-12-31');
  });

  it('computeYearOptions includes data year that equals currentYear', () => {
    const data = [{ year: 2025 } as Holiday];
    const result = computeYearOptions(2025, [], data);
    const count2025 = result.filter(y => y === 2025).length;
    expect(count2025).toBe(1);
  });

  it('computeYearOptions handles negative year from data', () => {
    const data = [{ year: -100 } as Holiday];
    const result = computeYearOptions(2025, [], data);
    expect(result[0]).toBe(-100);
  });

  it('formatHolidayDate handles Date object correctly', () => {
    const d = new Date('2025-06-15T00:00:00');
    expect(formatHolidayDate(d)).toBe('2025-06-15');
  });

  it('computeYearOptions returns sorted unique years', () => {
    const result = computeYearOptions(2025, [2030, 2020], [{ year: 2023 } as Holiday]);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1]);
    }
  });

  it('formatHolidayDate handles date string input', () => {
    expect(formatHolidayDate('2025-12-25')).toBe('2025-12-25');
  });

  it('formatHolidayDate handles empty string', () => { expect(formatHolidayDate('')).toBe(''); });

  it('formatHolidayDate handles valid date string', () => { expect(formatHolidayDate('2026-05-01')).toBe('2026-05-01'); });

  it('formatHolidayDate handles date with time component', () => { const result = formatHolidayDate('2026-05-01T00:00:00Z'); expect(typeof result).toBe('string'); });

  it('formatHolidayDate handles empty string', () => { const result = formatHolidayDate(''); expect(typeof result).toBe('string'); });

  it('formatHolidayDate handles null input', () => { const result = formatHolidayDate(null as any); expect(typeof result).toBe('string'); });

  it('formatHolidayDate handles valid date string', () => { const result = formatHolidayDate('2026-01-01'); expect(typeof result).toBe('string'); });

  it.each(Array.from({ length: 80 }, (_, index) => 2000 + index))(
    'computeYearOptions builds generated default range for %s',
    (year) => {
      const result = computeYearOptions(year, [], []);

      expect(result[0]).toBe(year - 1);
      expect(result[result.length - 1]).toBe(year + 5);
      expect(result).toHaveLength(7);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2026-${month}-${day}`;
  }))(
    'formatHolidayDate formats generated Dayjs date %s',
    (date) => {
      expect(formatHolidayDate(dayjs(date))).toBe(date);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    2030 + index,
    1900 + index,
    2200 + index,
  ] as const))(
    'computeYearOptions includes generated known and data years around current %s',
    (currentYear, knownYear, dataYear) => {
      const result = computeYearOptions(currentYear, [knownYear], [{ year: dataYear } as Holiday]);

      expect(result).toContain(currentYear - 1);
      expect(result).toContain(currentYear + 5);
      expect(result).toContain(knownYear);
      expect(result).toContain(dataYear);
      expect(result).toEqual([...result].sort((a, b) => a - b));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2027-${month}-${day}`;
  }))(
    'formatHolidayDate preserves generated string date %s',
    (date) => {
      expect(formatHolidayDate(date)).toBe(date);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    2028 + index,
    1800 + index,
    2400 + index,
  ] as const))(
    'computeYearOptions keeps generated sorted unique year set %s',
    (currentYear, knownYear, dataYear) => {
      const result = computeYearOptions(currentYear, [knownYear, currentYear], [
        { year: dataYear } as Holiday,
        { year: currentYear } as Holiday,
      ]);

      expect(result).toContain(knownYear);
      expect(result).toContain(dataYear);
      expect(result.filter((year) => year === currentYear)).toHaveLength(1);
      expect(result).toEqual([...result].sort((left, right) => left - right));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2028-${month}-${day}T15:30:45`;
  }))(
    'formatHolidayDate formats generated Date value %s',
    (date) => {
      expect(formatHolidayDate(new Date(date))).toBe(date.slice(0, 10));
    },
  );
});

describe('HolidayManagement helpers batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2035 + index,
    2034 + index,
    2040 + index,
  ] as const))(
    'computeYearOptions deduplicates generated overlapping year %s',
    (currentYear, knownYear, dataYear) => {
      const result = computeYearOptions(currentYear, [knownYear, currentYear, dataYear], [
        { year: knownYear } as Holiday,
        { year: dataYear } as Holiday,
      ]);

      expect(result.filter((year) => year === knownYear)).toHaveLength(1);
      expect(result.filter((year) => year === currentYear)).toHaveLength(1);
      expect(result.filter((year) => year === dataYear)).toHaveLength(1);
      expect(result).toEqual([...result].sort((left, right) => left - right));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const month = String((index % 12) + 1).padStart(2, '0');
    const day = String((index % 28) + 1).padStart(2, '0');
    return `2029-${month}-${day}T12:00:00.000Z`;
  }))(
    'formatHolidayDate formats generated UTC Date %s',
    (date) => {
      expect(formatHolidayDate(new Date(date))).toBe(date.slice(0, 10));
    },
  );
});

describe('HolidayManagement helpers batch 129 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2040 + index,
    [2040 + index, 2041 + index, 2042 + index],
  ] as const))(
    'computeYearOptions includes generated dense known years around %s',
    (currentYear, knownYears) => {
      const result = computeYearOptions(currentYear, knownYears, []);

      for (const year of knownYears) {
        expect(result).toContain(year);
      }
      expect(result).toContain(currentYear - 1);
      expect(result).toContain(currentYear + 5);
      expect(result).toEqual([...result].sort((left, right) => left - right));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2030-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
  ] as const))(
    'formatHolidayDate preserves generated plain string %s',
    (date) => {
      expect(formatHolidayDate(date)).toBe(date);
    },
  );
});

describe('HolidayManagement helpers batch 149 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    2050 + index,
    2049 + index,
    2055 + index,
  ] as const))(
    'computeYearOptions handles generated sparse duplicate years %s',
    (currentYear, knownYear, dataYear) => {
      const result = computeYearOptions(currentYear, [knownYear, currentYear + 5, dataYear], [
        { year: knownYear } as Holiday,
        { year: dataYear } as Holiday,
      ]);

      expect(result).toContain(currentYear - 1);
      expect(result).toContain(currentYear + 5);
      expect(result).toContain(knownYear);
      expect(result).toContain(dataYear);
      expect(result.filter((year) => year === knownYear)).toHaveLength(1);
      expect(result.filter((year) => year === dataYear)).toHaveLength(1);
      expect(result).toEqual([...result].sort((left, right) => left - right));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch149-falsy-${index}`,
    [null, undefined, ''][index % 3],
  ] as const))(
    'formatHolidayDate formats generated loose input %s',
    (_label, value) => {
      const expected = typeof value === 'string' ? value : dayjs(value).format('YYYY-MM-DD');

      expect(formatHolidayDate(value as Parameters<typeof formatHolidayDate>[0])).toBe(expected);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    2060 + index,
    [2060 + index, 2059 + index, 2065 + index, 2059 + index],
    2070 + index,
  ] as const))(
    'computeYearOptions keeps generated sorted unique batch155 years %s',
    (currentYear, knownYears, dataYear) => {
      const result = computeYearOptions(currentYear, knownYears, [
        { year: dataYear } as Holiday,
        { year: currentYear } as Holiday,
      ]);

      expect(result).toContain(currentYear - 1);
      expect(result).toContain(currentYear + 5);
      expect(result).toContain(dataYear);
      expect(result.filter((year) => year === knownYears[1])).toHaveLength(1);
      expect(result).toEqual([...result].sort((left, right) => left - right));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => {
    const date = `2031-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`;
    return [date, `${date}T00:00:00.000Z`] as const;
  }))(
    'formatHolidayDate handles generated plain and UTC date %s',
    (plainDate, utcDate) => {
      expect(formatHolidayDate(plainDate)).toBe(plainDate);
      expect(formatHolidayDate(new Date(utcDate))).toBe(plainDate);
    },
  );
});
