import { describe, it, expect } from 'vitest';
import { computeCheckProgress } from './CheckItems';
import type { CheckItem } from '../../../types';

function makeItems(overrides: Partial<CheckItem>[]): CheckItem[] {
  return overrides.map((o, i) => ({ id: String(i), title: 't', checked: false, activityId: 'x', ...o })) as CheckItem[];
}

describe('computeCheckProgress', () => {
  it('returns 0 percent for empty list', () => {
    expect(computeCheckProgress([])).toEqual({ checked: 0, total: 0, percent: 0 });
  });

  it('returns 100 percent when all checked', () => {
    const items = makeItems([{ checked: true }, { checked: true }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 2, total: 2, percent: 100 });
  });

  it('returns 50 percent when half checked', () => {
    const items = makeItems([{ checked: true }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 2, percent: 50 });
  });

  it('rounds percent', () => {
    const items = makeItems([{ checked: true }, { checked: false }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 3, percent: 33 });
  });

  it('returns 0 checked for all unchecked items', () => {
    const items = makeItems([{ checked: false }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 0, total: 2, percent: 0 });
  });

  it('handles single item correctly', () => {
    const items = makeItems([{ checked: true }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 1, percent: 100 });
  });

  it('handles large number of items', () => {
    const items = makeItems(Array.from({ length: 99 }, () => ({ checked: true })));
    expect(computeCheckProgress(items)).toEqual({ checked: 99, total: 99, percent: 100 });
  });

  it('handles null checked as unchecked', () => {
    const items = makeItems([{ checked: null as unknown as boolean }, { checked: true }]);
    const result = computeCheckProgress(items);
    expect(result.checked).toBe(1);
    expect(result.total).toBe(2);
  });

  it('computes 67 percent for two of three checked', () => {
    const items = makeItems([{ checked: true }, { checked: true }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 2, total: 3, percent: 67 });
  });

  it('handles undefined checked as unchecked', () => {
    const items = makeItems([{ checked: undefined as unknown as boolean }, { checked: true }]);
    const result = computeCheckProgress(items);
    expect(result.checked).toBe(1);
    expect(result.percent).toBe(50);
  });

  it('rounds 1/7 to 14 percent', () => {
    const items = makeItems([
      { checked: true },
      { checked: false },
      { checked: false },
      { checked: false },
      { checked: false },
      { checked: false },
      { checked: false },
    ]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 7, percent: 14 });
  });

  it('returns correct percent for 1 of 4 checked', () => {
    const items = makeItems([{ checked: true }, { checked: false }, { checked: false }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 4, percent: 25 });
  });

  it('computes 99 percent for 99 of 100 checked', () => {
    const items = makeItems(
      Array.from({ length: 100 }, (_, i) => ({ checked: i < 99 }))
    );
    expect(computeCheckProgress(items)).toEqual({ checked: 99, total: 100, percent: 99 });
  });

  it('rounds 199 of 200 to 100 percent', () => {
    const items = makeItems(
      Array.from({ length: 200 }, (_, i) => ({ checked: i < 199 }))
    );
    expect(computeCheckProgress(items)).toEqual({ checked: 199, total: 200, percent: 100 });
  });

  it('rounds 1 of 1000 to 0 percent', () => {
    const items = makeItems(
      Array.from({ length: 1000 }, (_, i) => ({ checked: i === 0 }))
    );
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 1000, percent: 0 });
  });

  it('treats zero as unchecked', () => {
    const items = makeItems([{ checked: 0 as unknown as boolean }, { checked: true }]);
    const result = computeCheckProgress(items);
    expect(result.checked).toBe(1);
    expect(result.total).toBe(2);
    expect(result.percent).toBe(50);
  });

  it('computes percent correctly for 2 of 3 items rounded', () => {
    const items = makeItems([{ checked: false }, { checked: true }, { checked: true }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 2, total: 3, percent: 67 });
  });

  it('treats string "true" as checked', () => {
    const items = makeItems([{ checked: 'true' as unknown as boolean }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 2, percent: 50 });
  });

  it('returns 0 percent for all unchecked items', () => {
    const items = makeItems([{ checked: false }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 0, total: 2, percent: 0 });
  });

  it('treats empty string as unchecked', () => {
    const items = makeItems([{ checked: '' as unknown as boolean }, { checked: true }]);
    const result = computeCheckProgress(items);
    expect(result.checked).toBe(1);
    expect(result.total).toBe(2);
    expect(result.percent).toBe(50);
  });

  it('computeCheckProgress returns zero totals for empty array', () => {
    const result = computeCheckProgress([]);
    expect(result.total).toBe(0);
    expect(result.checked).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('computeCheckProgress returns 100 percent when all checked', () => {
    const result = computeCheckProgress([
      { id: '1', content: 'a', checked: true },
      { id: '2', content: 'b', checked: true },
    ]);
    expect(result.percent).toBe(100);
    expect(result.checked).toBe(2);
  });

  it('treats numeric 1 as checked', () => {
    const items = makeItems([{ checked: 1 as unknown as boolean }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 2, percent: 50 });
  });

  it('computes 0 percent for single unchecked item', () => {
    const items = makeItems([{ checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 0, total: 1, percent: 0 });
  });

  it('handles 33 percent for one checked out of three', () => {
    const items = makeItems([{ checked: true }, { checked: false }, { checked: false }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 3, percent: 33 });
  });

  it('computeCheckProgress with single checked item returns 100 percent', () => {
    const items = makeItems([{ checked: true }]);
    expect(computeCheckProgress(items)).toEqual({ checked: 1, total: 1, percent: 100 });
  });

  it('computeCheckProgress with empty items array returns zero', () => {
    expect(computeCheckProgress([])).toEqual({ checked: 0, total: 0, percent: 0 });
  });

  it('computeCheckProgress with all checked returns 100 percent', () => {
    const items = [{ checked: true }, { checked: true }];
    expect(computeCheckProgress(items).percent).toBe(100);
  });

  it('computeCheckProgress with mixed checked returns correct percent', () => {
    const items = [{ checked: true }, { checked: false }, { checked: true }];
    expect(computeCheckProgress(items).percent).toBe(67);
  });

  it('computeCheckProgress with empty array returns zero', () => {
    expect(computeCheckProgress([]).percent).toBe(0);
  });

  it('computeCheckProgress with all unchecked returns zero percent', () => {
    const items = [{ checked: false }, { checked: false }];
    expect(computeCheckProgress(items).percent).toBe(0);
  });

  it('computeCheckProgress with all checked returns 100 percent', () => {
    const items = [{ checked: true }, { checked: true }];
    expect(computeCheckProgress(items).percent).toBe(100);
  });

  it('computeCheckProgress with mixed checked returns correct percent', () => {
    const items = [{ checked: true }, { checked: false }];
    expect(computeCheckProgress(items).percent).toBe(50);
  });

  it('computeCheckProgress returns 0 for empty items', () => {
    expect(computeCheckProgress([]).percent).toBe(0);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 1,
    Math.floor((index + 1) / 2),
  ] as const))(
    'computeCheckProgress handles generated checked ratio %s/%s',
    (total, checked) => {
      const items = makeItems(Array.from({ length: total }, (_, itemIndex) => ({ checked: itemIndex < checked })));
      const result = computeCheckProgress(items);

      expect(result.total).toBe(total);
      expect(result.checked).toBe(checked);
      expect(result.percent).toBe(Math.round((checked / total) * 100));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 2,
    index % 3,
  ] as const))(
    'computeCheckProgress treats generated truthy checked values for total %s',
    (total, truthyCount) => {
      const items = makeItems(Array.from({ length: total }, (_, itemIndex) => ({
        checked: itemIndex < truthyCount ? ('yes' as unknown as boolean) : false,
      })));
      const result = computeCheckProgress(items);

      expect(result.checked).toBe(truthyCount);
      expect(result.total).toBe(total);
      expect(result.percent).toBe(Math.round((truthyCount / total) * 100));
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3,
    (index % (index + 3)) + 1,
  ] as const))(
    'computeCheckProgress rounds generated partial ratio %#',
    (total, checked) => {
      const items = makeItems(Array.from({ length: total }, (_, itemIndex) => ({ checked: itemIndex < checked })));
      const result = computeCheckProgress(items);

      expect(result).toEqual({
        checked,
        total,
        percent: Math.round((checked / total) * 100),
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 1,
    index % 2 === 0 ? 0 : null,
  ] as const))(
    'computeCheckProgress treats generated falsy checked values as unchecked %#',
    (total, falsyValue) => {
      const items = makeItems(Array.from({ length: total }, () => ({
        checked: falsyValue as unknown as boolean,
      })));
      const result = computeCheckProgress(items);

      expect(result.checked).toBe(0);
      expect(result.total).toBe(total);
      expect(result.percent).toBe(0);
    },
  );
});
