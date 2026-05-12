import { describe, it, expect } from 'vitest';
import { createHolidaySchema, updateHolidaySchema, generateHolidaySchema } from './holidays';

describe('holidays schemas', () => {
  describe('createHolidaySchema', () => {
    it('accepts valid holiday', () => {
      const result = createHolidaySchema.parse({ date: '2026-01-01', name: '元旦' });
      expect(result).toEqual({ date: '2026-01-01', name: '元旦', type: 'HOLIDAY' });
    });

    it('accepts MAKEUP type', () => {
      const result = createHolidaySchema.parse({ date: '2026-01-04', name: '补班', type: 'MAKEUP' });
      expect(result.type).toBe('MAKEUP');
    });

    it('defaults type to HOLIDAY', () => {
      const result = createHolidaySchema.parse({ date: '2026-01-01', name: 'test' });
      expect(result.type).toBe('HOLIDAY');
    });

    it('rejects invalid date format', () => {
      expect(() => createHolidaySchema.parse({ date: '01-01-2026', name: 'test' })).toThrow();
    });

    it('rejects empty name', () => {
      expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: '' })).toThrow();
    });

    it('rejects name over 50 chars', () => {
      expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: 'x'.repeat(51) })).toThrow();
    });

    it('rejects invalid type', () => {
      expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: 'test', type: 'INVALID' })).toThrow();
    });
  });

  describe('updateHolidaySchema', () => {
    it('accepts partial updates', () => {
      expect(updateHolidaySchema.parse({ name: 'new name' })).toEqual({ name: 'new name' });
    });

    it('accepts empty object', () => {
      expect(updateHolidaySchema.parse({})).toEqual({});
    });

    it('rejects invalid date', () => {
      expect(() => updateHolidaySchema.parse({ date: 'not-a-date' })).toThrow();
    });

    it('rejects empty name', () => {
      expect(() => updateHolidaySchema.parse({ name: '' })).toThrow();
    });
  });

  describe('generateHolidaySchema', () => {
    it('accepts valid year', () => {
      const result = generateHolidaySchema.parse({ year: 2026 });
      expect(result).toEqual({ year: 2026, preferOfficial: true, overwrite: false });
    });

    it('rejects year below 2020', () => {
      expect(() => generateHolidaySchema.parse({ year: 2019 })).toThrow();
    });

    it('rejects year above 2100', () => {
      expect(() => generateHolidaySchema.parse({ year: 2101 })).toThrow();
    });

    it('defaults preferOfficial and overwrite', () => {
      const result = generateHolidaySchema.parse({ year: 2026 });
      expect(result.preferOfficial).toBe(true);
      expect(result.overwrite).toBe(false);
    });

    it('rejects non-integer year', () => {
      expect(() => generateHolidaySchema.parse({ year: 2026.5 })).toThrow();
    });
  });

  it('createHolidaySchema rejects date without leading zeros', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-1-1', name: 'test' })).toThrow();
  });

  it('generateHolidaySchema accepts year at boundary 2020', () => {
    const result = generateHolidaySchema.parse({ year: 2020 });
    expect(result.year).toBe(2020);
  });

  it('generateHolidaySchema accepts year at boundary 2100', () => {
    const result = generateHolidaySchema.parse({ year: 2100 });
    expect(result.year).toBe(2100);
  });

  it('updateHolidaySchema accepts valid type change', () => {
    const result = updateHolidaySchema.parse({ type: 'MAKEUP' });
    expect(result.type).toBe('MAKEUP');
  });

  it('createHolidaySchema accepts name at exactly 50 characters', () => {
    const result = createHolidaySchema.parse({ date: '2026-01-01', name: 'x'.repeat(50) });
    expect(result.name).toHaveLength(50);
  });

  it('generateHolidaySchema rejects missing year field', () => {
    expect(() => generateHolidaySchema.parse({})).toThrow();
  });

  it('createHolidaySchema rejects date with time component', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-01-01T00:00:00Z', name: 'test' })).toThrow();
  });

  it('createHolidaySchema rejects non-string date', () => {
    expect(() => createHolidaySchema.parse({ date: 20260101, name: 'test' })).toThrow();
  });

  it('generateHolidaySchema accepts explicit preferOfficial false', () => {
    const result = generateHolidaySchema.parse({ year: 2026, preferOfficial: false });
    expect(result.preferOfficial).toBe(false);
    expect(result.overwrite).toBe(false);
  });

  it('generateHolidaySchema defaults overwrite to false', () => {
    const result = generateHolidaySchema.parse({ year: 2026 });
    expect(result.overwrite).toBe(false);
    expect(result.preferOfficial).toBe(true);
  });

  it('createHolidaySchema rejects non-string name', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: 123 })).toThrow();
  });

  it('createHolidaySchema accepts MAKEUP type', () => {
    const result = createHolidaySchema.parse({ date: '2026-01-03', name: '调休', type: 'MAKEUP' });
    expect(result.type).toBe('MAKEUP');
  });

  it('createHolidaySchema rejects invalid type', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: '测试', type: 'INVALID' })).toThrow();
  });

  it('updateHolidaySchema accepts empty body', () => {
    const result = updateHolidaySchema.parse({});
    expect(result.name).toBeUndefined();
  });

  it('createHolidaySchema rejects empty date', () => {
    expect(() => createHolidaySchema.parse({ date: '', name: 'Test', type: 'PUBLIC' })).toThrow();
  });

  it('createHolidaySchema rejects empty name', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: '', type: 'PUBLIC' })).toThrow();
  });

  it('createHolidaySchema rejects invalid type', () => {
    expect(() => createHolidaySchema.parse({ date: '2026-01-01', name: 'Test', type: 'INVALID' })).toThrow();
  });

  it('generateHolidaySchema accepts explicit overwrite true', () => {
    const result = generateHolidaySchema.parse({ year: 2026, overwrite: true });
    expect(result.overwrite).toBe(true);
  });

  it('generateHolidaySchema rejects year below valid range', () => {
    expect(() => generateHolidaySchema.parse({ year: 1999 })).toThrow();
  });
});
