import { describe, it, expect } from 'vitest';
import { getApiErrorMessage, escapeCsvHelper, getMsDateHelper, computeSortOrder, formatDeps } from './index';
import type { Activity } from '../../../types';

describe('getApiErrorMessage', () => {
  it('extracts response.data.error string', () => {
    const err = { response: { data: { error: 'Something failed' } } };
    expect(getApiErrorMessage(err, 'fallback')).toBe('Something failed');
  });

  it('returns fallback when no response', () => {
    expect(getApiErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('returns fallback when no data', () => {
    expect(getApiErrorMessage({ response: {} }, 'fallback')).toBe('fallback');
  });

  it('returns fallback when error is not string', () => {
    expect(getApiErrorMessage({ response: { data: { error: 404 } } }, 'fallback')).toBe('fallback');
  });

  it('returns fallback for primitive error', () => {
    expect(getApiErrorMessage('string error', 'fallback')).toBe('fallback');
  });

  it('extracts Chinese error message', () => {
    const err = { response: { data: { error: '权限不足' } } };
    expect(getApiErrorMessage(err, 'fallback')).toBe('权限不足');
  });
});

describe('escapeCsvHelper', () => {
  it('returns simple string unchanged', () => {
    expect(escapeCsvHelper('hello')).toBe('hello');
  });

  it('wraps strings with commas in quotes', () => {
    expect(escapeCsvHelper('a,b')).toBe('"a,b"');
  });

  it('wraps strings with double quotes and escapes them', () => {
    expect(escapeCsvHelper('say "hello"')).toBe('"say ""hello"""');
  });

  it('wraps strings with newlines in quotes', () => {
    expect(escapeCsvHelper('line1\nline2')).toBe('"line1\nline2"');
  });

  it('returns empty string unchanged', () => {
    expect(escapeCsvHelper('')).toBe('');
  });

  it('handles all three special characters at once', () => {
    expect(escapeCsvHelper('a,"b"\nc')).toBe('"a,""b""\nc"');
  });
});

describe('getMsDateHelper', () => {
  it('returns planEndDate as dayjs when present', () => {
    const activity = { planEndDate: '2025-06-15', planStartDate: '2025-06-01' } as Activity;
    const result = getMsDateHelper(activity);
    expect(result).not.toBeNull();
    expect(result!.format('YYYY-MM-DD')).toBe('2025-06-15');
  });

  it('returns planStartDate when planEndDate is null', () => {
    const activity = { planEndDate: null, planStartDate: '2025-06-01' } as Activity;
    const result = getMsDateHelper(activity);
    expect(result).not.toBeNull();
    expect(result!.format('YYYY-MM-DD')).toBe('2025-06-01');
  });

  it('returns null when both dates are null', () => {
    const activity = { planEndDate: null, planStartDate: null } as Activity;
    expect(getMsDateHelper(activity)).toBeNull();
  });

  it('prefers planEndDate over planStartDate', () => {
    const activity = { planEndDate: '2025-07-01', planStartDate: '2025-06-01' } as Activity;
    const result = getMsDateHelper(activity);
    expect(result!.format('YYYY-MM-DD')).toBe('2025-07-01');
  });
});

describe('computeSortOrder', () => {
  it('returns midpoint between two items', () => {
    const acts = [{ sortOrder: 10 }, { sortOrder: 30 }];
    expect(computeSortOrder(acts, 1)).toBe(20);
  });

  it('inserts at beginning with prev=0', () => {
    const acts = [{ sortOrder: 40 }, { sortOrder: 80 }];
    expect(computeSortOrder(acts, 0)).toBe(20);
  });

  it('inserts at end with next=prev+20', () => {
    const acts = [{ sortOrder: 10 }, { sortOrder: 30 }];
    expect(computeSortOrder(acts, 2)).toBe(40);
  });

  it('handles empty array inserting at 0', () => {
    expect(computeSortOrder([], 0)).toBe(10);
  });

  it('handles single item at index 0', () => {
    const acts = [{ sortOrder: 50 }];
    expect(computeSortOrder(acts, 0)).toBe(25);
  });

  it('handles single item appended at end', () => {
    const acts = [{ sortOrder: 50 }];
    expect(computeSortOrder(acts, 1)).toBe(60);
  });

  it('floors non-integer midpoint', () => {
    const acts = [{ sortOrder: 10 }, { sortOrder: 21 }];
    expect(computeSortOrder(acts, 1)).toBe(15);
  });
});

describe('formatDeps', () => {
  const seqMap = new Map<string, number>([['a1', 1], ['a2', 2], ['a3', 3]]);

  it('returns empty string when no dependencies', () => {
    expect(formatDeps({ id: 'x' } as Activity, seqMap)).toBe('');
  });

  it('returns empty string when dependencies is empty array', () => {
    expect(formatDeps({ id: 'x', dependencies: [] } as Activity, seqMap)).toBe('');
  });

  it('formats single FS dependency', () => {
    const act = { id: 'x', dependencies: [{ id: 'a1', type: '0' }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('001FS');
  });

  it('formats SS dependency', () => {
    const act = { id: 'x', dependencies: [{ id: 'a2', type: '1' }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('002SS');
  });

  it('formats FF dependency', () => {
    const act = { id: 'x', dependencies: [{ id: 'a3', type: '2' }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('003FF');
  });

  it('formats positive lag with plus sign', () => {
    const act = { id: 'x', dependencies: [{ id: 'a1', type: '0', lag: 3 }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('001FS+3');
  });

  it('formats negative lag', () => {
    const act = { id: 'x', dependencies: [{ id: 'a1', type: '0', lag: -2 }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('001FS-2');
  });

  it('formats multiple dependencies', () => {
    const act = { id: 'x', dependencies: [{ id: 'a1', type: '0' }, { id: 'a2', type: '1' }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('001FS, 002SS');
  });

  it('shows ? for unknown dependency id', () => {
    const act = { id: 'x', dependencies: [{ id: 'unknown', type: '0' }] } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('?FS');
  });

  it('parses JSON string dependencies', () => {
    const act = { id: 'x', dependencies: JSON.stringify([{ id: 'a1', type: '0' }]) } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('001FS');
  });

  it('formatDeps returns empty string for null dependencies', () => {
    const act = { id: 'x', dependencies: null } as unknown as Activity;
    expect(formatDeps(act, seqMap)).toBe('');
  });

  it('formatDeps returns empty string for empty dependencies', () => { const act = { id: 'x', dependencies: [] } as unknown as Activity; expect(formatDeps(act, {})).toBe(''); });

  it('formatDeps handles null dependencies', () => { const act = { id: 'x', dependencies: null } as unknown as Activity; expect(formatDeps(act, {})).toBe(''); });

  it('formatDeps handles activity with single dependency', () => { const act = { id: 'x', dependencies: [{ id: 'a', type: '0' }] } as unknown as Activity; const seqMap = new Map([['a', '001']]); expect(typeof formatDeps(act, seqMap)).toBe('string'); });

  it('formatDeps handles activity with multiple dependencies', () => { const act = { id: 'x', dependencies: [{ id: 'a', type: '0' }, { id: 'b', type: '0' }] } as unknown as Activity; const seqMap = new Map([['a', '001'], ['b', '002']]); const result = formatDeps(act, seqMap); expect(result).toContain('001'); });

  it('formatDeps handles activity with no dependencies', () => { const act = { id: 'x', dependencies: [] } as unknown as Activity; const seqMap = new Map(); const result = formatDeps(act, seqMap); expect(result).toBe(''); });

  it('formatDeps handles null dependencies', () => { const act = { id: 'x', dependencies: null } as unknown as Activity; const seqMap = new Map(); const result = formatDeps(act, seqMap); expect(typeof result).toBe('string'); });
});

describe('Project detail helpers batch 141 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `value-${index},with,comma`,
    `"value-${index},with,comma"`,
  ] as const))(
    'escapeCsvHelper wraps generated comma value %#',
    (value, expected) => {
      expect(escapeCsvHelper(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [{ id: `a-${index}`, type: `${index % 4}`, lag: index % 3 === 0 ? index : index % 3 === 1 ? -index : 0 }],
    index,
  ] as const))(
    'formatDeps formats generated dependency lag %#',
    (dependencies, index) => {
      const seqMap = new Map([[`a-${index}`, index + 1]]);
      const act = { id: 'x', dependencies } as unknown as Activity;
      const depTypeMap = { '0': 'FS', '1': 'SS', '2': 'FF', '3': 'SF' };
      const lag = dependencies[0].lag ?? 0;
      const lagStr = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';

      expect(formatDeps(act, seqMap, depTypeMap)).toBe(`${String(index + 1).padStart(3, '0')}${depTypeMap[dependencies[0].type]}${lagStr}`);
    },
  );
});
