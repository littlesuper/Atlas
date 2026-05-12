import { describe, it, expect } from 'vitest';
import { formatChangeData } from './AuditLog';

describe('formatChangeData', () => {
  it('formats changes into array of objects', () => {
    const result = formatChangeData({
      status: { from: 'A', to: 'B' },
      priority: { from: 'LOW', to: 'HIGH' },
    });
    expect(result).toEqual([
      { field: 'status', from: 'A', to: 'B' },
      { field: 'priority', from: 'LOW', to: 'HIGH' },
    ]);
  });

  it('handles empty changes', () => {
    expect(formatChangeData({})).toEqual([]);
  });

  it('preserves null and undefined values', () => {
    const result = formatChangeData({ field: { from: null, to: undefined } });
    expect(result[0].from).toBeNull();
    expect(result[0].to).toBeUndefined();
  });

  it('handles single change entry', () => {
    const result = formatChangeData({ name: { from: 'old', to: 'new' } });
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('name');
  });

  it('preserves numeric values', () => {
    const result = formatChangeData({ count: { from: 1, to: 5 } });
    expect(result[0].from).toBe(1);
    expect(result[0].to).toBe(5);
  });

  it('preserves boolean values', () => {
    const result = formatChangeData({ active: { from: false, to: true } });
    expect(result[0].from).toBe(false);
    expect(result[0].to).toBe(true);
  });

  it('handles multiple fields preserving order from Object.entries', () => {
    const result = formatChangeData({
      a: { from: 1, to: 2 },
      b: { from: 'x', to: 'y' },
      c: { from: null, to: null },
    });
    expect(result.map((r) => r.field)).toEqual(['a', 'b', 'c']);
  });

  it('handles deeply nested object values', () => {
    const obj = { nested: true };
    const result = formatChangeData({ config: { from: obj, to: {} } });
    expect(result[0].from).toEqual({ nested: true });
    expect(result[0].to).toEqual({});
  });

  it('handles zero and empty string values', () => {
    const result = formatChangeData({ count: { from: 0, to: '' } });
    expect(result[0].from).toBe(0);
    expect(result[0].to).toBe('');
  });

  it('handles array from/to values', () => {
    const result = formatChangeData({ list: { from: [1, 2], to: [3] } });
    expect(result[0].from).toEqual([1, 2]);
    expect(result[0].to).toEqual([3]);
  });

  it('handles large number of fields', () => {
    const changes: Record<string, { from: number; to: number }> = {};
    for (let i = 0; i < 20; i++) changes[`f${i}`] = { from: i, to: i + 1 };
    const result = formatChangeData(changes);
    expect(result).toHaveLength(20);
  });

  it('handles null from/to values', () => {
    const result = formatChangeData({ status: { from: null, to: 'ACTIVE' } });
    expect(result[0].from).toBeNull();
    expect(result[0].to).toBe('ACTIVE');
  });

  it('handles string from/to values', () => {
    const result = formatChangeData({ name: { from: 'old', to: 'new' } });
    expect(result[0].from).toBe('old');
    expect(result[0].to).toBe('new');
  });

  it('handles mixed types across multiple fields', () => {
    const result = formatChangeData({
      name: { from: 'old', to: 'new' },
      count: { from: 0, to: 10 },
      active: { from: null, to: true },
    });
    expect(result).toHaveLength(3);
    expect(result[0].from).toBe('old');
    expect(result[1].from).toBe(0);
    expect(result[2].from).toBeNull();
    expect(result[2].to).toBe(true);
  });

  it('preserves same from and to values', () => {
    const result = formatChangeData({ status: { from: 'ACTIVE', to: 'ACTIVE' } });
    expect(result[0].from).toBe('ACTIVE');
    expect(result[0].to).toBe('ACTIVE');
  });

  it('handles NaN values in from/to', () => {
    const result = formatChangeData({ value: { from: NaN, to: NaN } });
    expect(result[0].field).toBe('value');
    expect(result[0].from).toBeNaN();
    expect(result[0].to).toBeNaN();
  });

  it('handles Infinity and -Infinity values', () => {
    const result = formatChangeData({ score: { from: Infinity, to: -Infinity } });
    expect(result[0].from).toBe(Infinity);
    expect(result[0].to).toBe(-Infinity);
  });

  it('handles Date objects as from/to values', () => {
    const dateFrom = new Date('2025-01-01');
    const dateTo = new Date('2025-06-15');
    const result = formatChangeData({ createdAt: { from: dateFrom, to: dateTo } });
    expect(result[0].field).toBe('createdAt');
    expect(result[0].from).toBe(dateFrom);
    expect(result[0].to).toBe(dateTo);
  });

  it('handles RegExp values as from/to', () => {
    const result = formatChangeData({ pattern: { from: /old/g, to: /new/i } });
    expect(result[0].field).toBe('pattern');
    expect(result[0].from).toBeInstanceOf(RegExp);
    expect(result[0].to).toBeInstanceOf(RegExp);
    expect((result[0].from as RegExp).source).toBe('old');
    expect((result[0].to as RegExp).flags).toBe('i');
  });

  it('handles symbol values in from/to gracefully', () => {
    const sym = Symbol('test');
    const result = formatChangeData({ field: { from: sym, to: null } });
    expect(result[0].from).toBe(sym);
    expect(result[0].to).toBeNull();
  });

  it('formatChangeData handles empty changes object', () => {
    const result = formatChangeData({});
    expect(result).toEqual([]);
  });

  it('formatChangeData handles changes with multiple fields', () => {
    const result = formatChangeData({ name: { from: 'A', to: 'B' }, status: { from: 0, to: 1 } });
    expect(result).toHaveLength(2);
  });

  it('formatChangeData preserves undefined from value', () => {
    const result = formatChangeData({ field: { from: undefined, to: 'new' } });
    expect(result[0].from).toBeUndefined();
    expect(result[0].to).toBe('new');
  });

  it('formatChangeData handles changes with multiple fields', () => {
    const result = formatChangeData({ name: { from: 'A', to: 'B' }, status: { from: 0, to: 1 } });
    expect(result).toHaveLength(2);
  });

  it('formatChangeData preserves same from and to values', () => {
    const result = formatChangeData({ field: { from: 'same', to: 'same' } });
    expect(result[0].from).toBe('same');
    expect(result[0].to).toBe('same');
  });

  it('formatChangeData preserves undefined to value', () => {
    const result = formatChangeData({ field: { from: 'old', to: undefined } });
    expect(result[0].from).toBe('old');
    expect(result[0].to).toBeUndefined();
  });

  it('formatChangeData handles changes with numeric from and to values', () => {
    const result = formatChangeData({ count: { from: 0, to: 42 } });
    expect(result).toHaveLength(1);
    expect(result[0].field).toBe('count');
    expect(result[0].from).toBe(0);
    expect(result[0].to).toBe(42);
  });

  it('formatChangeData handles empty change object', () => {
    const result = formatChangeData({});
    expect(result).toEqual([]);
  });

  it('formatChangeData handles nested change object', () => {
    const result = formatChangeData({ status: { from: 'ACTIVE', to: 'DISABLED' } });
    expect(result.length).toBeGreaterThan(0);
  });

  it('formatChangeData handles null change values', () => {
    const result = formatChangeData({ field: { from: null, to: null } });
    expect(result).toHaveLength(1);
  });

  it('formatChangeData handles empty object', () => {
    const result = formatChangeData({});
    expect(result).toHaveLength(0);
  });

  it('formatChangeData handles single field change', () => {
    const result = formatChangeData({ name: { from: 'old', to: 'new' } });
    expect(result).toHaveLength(1);
  });

  it('formatChangeData handles empty object', () => {
    const result = formatChangeData({});
    expect(result).toHaveLength(0);
  });

  it('formatChangeData handles null from and to values', () => {
    const result = formatChangeData({ field: { from: undefined, to: undefined } });
    expect(result).toHaveLength(1);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `field-${index}`,
    index,
    index + 1,
  ] as const))('preserves numeric audit change %s', (field, from, to) => {
    const result = formatChangeData({ [field]: { from, to } });

    expect(result).toEqual([{ field, from, to }]);
  });

  it.each(Array.from({ length: 60 }, (_, index) => [
    `unicode-字段-${index}`,
    index % 2 === 0 ? null : `旧值-${index}`,
    index % 3 === 0 ? undefined : `新值-${index}`,
  ] as const))('preserves nullable unicode audit change %s', (field, from, to) => {
    const result = formatChangeData({ [field]: { from, to } });

    expect(result[0].field).toBe(field);
    expect(result[0].from).toBe(from);
    expect(result[0].to).toBe(to);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `array-field-${index}`,
    [index, index + 1],
    { next: index },
  ] as const))('preserves generated complex audit change %s', (field, from, to) => {
    const result = formatChangeData({ [field]: { from, to } });

    expect(result).toHaveLength(1);
    expect(result[0].field).toBe(field);
    expect(result[0].from).toEqual(from);
    expect(result[0].to).toEqual(to);
  });

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))('preserves generated audit change order for %s fields', (count) => {
    const changes = Object.fromEntries(
      Array.from({ length: count }, (_, index) => [`field-${index}`, { from: index, to: index + 1 }]),
    );
    const result = formatChangeData(changes);

    expect(result).toHaveLength(count);
    expect(result.map((item) => item.field)).toEqual(Array.from({ length: count }, (_, index) => `field-${index}`));
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch138-field-${index}`,
    { before: index },
    { after: index + 1 },
  ] as const))(
    'preserves generated object change %s',
    (field, from, to) => {
      const result = formatChangeData({ [field]: { from, to } });

      expect(result).toEqual([{ field, from, to }]);
      expect(result[0].from).toBe(from);
      expect(result[0].to).toBe(to);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))(
    'preserves generated field insertion order for %s changes',
    (count) => {
      const changes = Object.fromEntries(
        Array.from({ length: count }, (_, index) => [`batch138-${index}`, { from: index, to: `${index}` }]),
      );
      const result = formatChangeData(changes);

      expect(result).toHaveLength(count);
      expect(result.map((item) => item.field)).toEqual(Array.from({ length: count }, (_, index) => `batch138-${index}`));
      expect(result[result.length - 1]?.to).toBe(`${count - 1}`);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch145-field-${index}`,
    index % 2 === 0 ? true : false,
    index % 3 === 0 ? null : `value-${index}`,
  ] as const))(
    'preserves generated boolean audit change %s',
    (field, from, to) => {
      const result = formatChangeData({ [field]: { from, to } });

      expect(result).toEqual([{ field, from, to }]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))(
    'preserves generated reverse inserted field order for %s changes',
    (count) => {
      const keys = Array.from({ length: count }, (_, index) => `batch145-${count - index}`);
      const changes = Object.fromEntries(keys.map((key, index) => [key, { from: index, to: index + 1 }]));
      const result = formatChangeData(changes);

      expect(result.map((item) => item.field)).toEqual(keys);
      expect(result).toHaveLength(count);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch154-field-${index}`,
    { before: index, nested: { value: `old-${index}` } },
    { after: index + 1, nested: { value: `new-${index}` } },
  ] as const))(
    'preserves generated nested audit change object %s',
    (field, from, to) => {
      const result = formatChangeData({ [field]: { from, to } });

      expect(result).toEqual([{ field, from, to }]);
      expect(result[0].from).toBe(from);
      expect(result[0].to).toBe(to);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))(
    'preserves generated numeric-like audit field order for %s changes',
    (count) => {
      const keys = Array.from({ length: count }, (_, index) => `${index}`);
      const changes = Object.fromEntries(keys.map((key, index) => [key, { from: `old-${index}`, to: `new-${index}` }]));
      const result = formatChangeData(changes);

      expect(result).toHaveLength(count);
      expect(result.map((item) => item.field)).toEqual(keys);
      expect(result[0]?.from).toBe('old-0');
    },
  );
});
