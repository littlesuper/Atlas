import { describe, it, expect } from 'vitest';
import dayjs, { Dayjs } from 'dayjs';
import { resolveTriple } from './ActivityDrawer';

const d = (iso: string) => dayjs(iso);

describe('resolveTriple', () => {
  it('when start changes and both start+end exist, recalculates dur', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: d('2025-03-07'), dur: null },
      'start'
    );
    expect(result.dur).toBe(5);
    expect(result.start!.format('YYYY-MM-DD')).toBe('2025-03-03');
  });

  it('when start changes with start+dur, computes end via addWorkdays', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: null, dur: 3 },
      'start'
    );
    expect(result.end).not.toBeNull();
    expect(result.dur).toBe(3);
  });

  it('when end changes and both start+end exist, recalculates dur', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: d('2025-03-05'), dur: 10 },
      'end'
    );
    expect(result.dur).toBe(3);
  });

  it('when end changes with end+dur, computes start via subtractWorkdays', () => {
    const result = resolveTriple(
      { start: null, end: d('2025-03-07'), dur: 3 },
      'end'
    );
    expect(result.start).not.toBeNull();
    expect(result.dur).toBe(3);
  });

  it('when dur changes with start+dur, computes end', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: null, dur: 5 },
      'dur'
    );
    expect(result.end).not.toBeNull();
    expect(result.end!.isAfter(result.start)).toBe(true);
  });

  it('when dur changes with end+dur, computes start', () => {
    const result = resolveTriple(
      { start: null, end: d('2025-03-10'), dur: 5 },
      'dur'
    );
    expect(result.start).not.toBeNull();
    expect(result.start!.isBefore(result.end)).toBe(true);
  });

  it('returns unchanged triple when insufficient data', () => {
    const t = { start: null, end: null, dur: null };
    const result = resolveTriple(t, 'start');
    expect(result).toBe(t);
  });

  it('returns unchanged when dur is 0 or negative', () => {
    const t = { start: d('2025-03-03'), end: null, dur: 0 };
    const result = resolveTriple(t, 'start');
    expect(result).toBe(t);
  });

  it('handles dur=0 on dur change', () => {
    const t = { start: null, end: d('2025-03-07'), dur: 0 };
    const result = resolveTriple(t, 'dur');
    expect(result).toBe(t);
  });

  it('returns unchanged when start changes with no end and no dur', () => {
    const t = { start: d('2025-03-03'), end: null, dur: null };
    const result = resolveTriple(t, 'start');
    expect(result).toBe(t);
  });

  it('returns unchanged when end changes with no start and no dur', () => {
    const t = { start: null, end: d('2025-03-07'), dur: null };
    const result = resolveTriple(t, 'end');
    expect(result).toBe(t);
  });

  it('returns unchanged when dur changes with no start and no end', () => {
    const t = { start: null, end: null, dur: 5 };
    const result = resolveTriple(t, 'dur');
    expect(result).toBe(t);
  });

  it('preserves exact start and end when recalculating dur', () => {
    const s = d('2025-01-06');
    const e = d('2025-01-10');
    const result = resolveTriple({ start: s, end: e, dur: 999 }, 'start');
    expect(result.start).toBe(s);
    expect(result.end).toBe(e);
    expect(result.dur).not.toBe(999);
  });

  it('handles negative dur on dur change', () => {
    const t = { start: null, end: d('2025-03-07'), dur: -3 };
    const result = resolveTriple(t, 'dur');
    expect(result).toBe(t);
  });

  it('returns unchanged when end changes with negative dur and no start', () => {
    const t = { start: null, end: d('2025-03-07'), dur: -5 };
    const result = resolveTriple(t, 'end');
    expect(result).toBe(t);
  });

  it('recalculates dur to 1 when start equals end on start change', () => {
    const s = d('2025-03-03');
    const result = resolveTriple({ start: s, end: s, dur: null }, 'start');
    expect(result.start).toBe(s);
    expect(result.end).toBe(s);
    expect(result.dur).toBe(1);
  });

  it('when dur changes with all three present, recomputes end from start', () => {
    const s = d('2025-03-03');
    const e = d('2025-03-20');
    const result = resolveTriple({ start: s, end: e, dur: 2 }, 'dur');
    expect(result.start).toBe(s);
    expect(result.dur).toBe(2);
    expect(result.end).not.toBe(e);
  });

  it('returns unchanged when start changes with only end present and no dur', () => {
    const s = d('2025-03-03');
    const e = d('2025-03-07');
    const result = resolveTriple({ start: s, end: e, dur: null }, 'start');
    expect(result.start).toBe(s);
    expect(result.end).toBe(e);
    expect(result.dur).not.toBeNull();
  });

  it('when end changes with all three present, recalculates dur', () => {
    const s = d('2025-03-03');
    const e = d('2025-03-14');
    const result = resolveTriple({ start: s, end: e, dur: 999 }, 'end');
    expect(result.start).toBe(s);
    expect(result.end).toBe(e);
    expect(result.dur).not.toBe(999);
    expect(result.dur).toBeGreaterThan(0);
  });

  it('when start changes with dur=1, computes end correctly', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: null, dur: 1 },
      'start'
    );
    expect(result.end).not.toBeNull();
    expect(result.dur).toBe(1);
    expect(result.end!.isBefore(result.start)).toBe(false);
  });

  it('returns unchanged when all three values are null', () => {
    const t = { start: null, end: null, dur: null };
    const result = resolveTriple(t, 'dur');
    expect(result).toBe(t);
  });

  it('resolveTriple with only start set returns unchanged triple', () => {
    const t = { start: dayjs('2025-01-01'), end: null, dur: null };
    const result = resolveTriple(t, 'start');
    expect(result.start).toBe(t.start);
    expect(result.end).toBeNull();
    expect(result.dur).toBeNull();
  });

  it('resolveTriple with only start returns unchanged', () => {
    const t = { start: dayjs('2025-01-01'), end: null as Dayjs | null, dur: null as number | null };
    const result = resolveTriple(t, 'start');
    expect(result.start).toBe(t.start);
    expect(result.end).toBeNull();
    expect(result.dur).toBeNull();
  });

  it('resolveTriple with start and end on same day returns dur of 1', () => {
    const s = dayjs('2025-03-03');
    const result = resolveTriple({ start: s, end: s, dur: null }, 'end');
    expect(result.dur).toBe(1);
  });

  it('resolveTriple returns unchanged when end changes with null start and null dur', () => {
    const t = { start: null as Dayjs | null, end: dayjs('2025-03-07'), dur: null as number | null };
    const result = resolveTriple(t, 'end');
    expect(result).toBe(t);
  });

  it('resolveTriple with only end set returns unchanged triple', () => {
    const t = { start: null, end: dayjs('2025-03-07'), dur: null };
    const result = resolveTriple(t, 'end');
    expect(result).toBe(t);
  });

  it('resolveTriple with only dur set returns unchanged triple', () => {
    const t = { start: null, end: null, dur: 5 };
    const result = resolveTriple(t, 'dur');
    expect(result).toBe(t);
  });

  it('resolveTriple with start and dur computes end correctly', () => {
    const result = resolveTriple(
      { start: d('2025-03-03'), end: null, dur: 3 },
      'dur'
    );
    expect(result.end).not.toBeNull();
    expect(result.start!.format('YYYY-MM-DD')).toBe('2025-03-03');
  });

  it('resolveTriple returns unchanged when no values are set', () => {
    const t = { start: null, end: null, dur: null };
    const result = resolveTriple(t, 'start');
    expect(result).toBe(t);
  });

  it('resolveTriple returns target when all fields null', () => { const t = { start: null, end: null, dur: null }; const result = resolveTriple(t, 'start'); expect(result).toBe(t); });

  it('resolveTriple handles start and end set with null duration', () => { const t = { start: '2026-01-01', end: '2026-01-10', dur: null }; const result = resolveTriple(t, 'dur'); expect(result.dur).toBeDefined(); });

  it('resolveTriple handles all null fields', () => { const t = { start: null, end: null, dur: null }; const result = resolveTriple(t, 'start'); expect(result.start).toBeNull(); });

  it('resolveTriple calculates duration from start and end', () => { const t = { start: dayjs('2026-01-01'), end: dayjs('2026-01-05'), dur: null }; const result = resolveTriple(t, 'dur'); expect(result).toBeDefined(); });

  it('resolveTriple handles all fields provided', () => { const t = { start: dayjs('2026-01-01'), end: dayjs('2026-01-05'), dur: 5 }; const result = resolveTriple(t, 'dur'); expect(result).toBeDefined(); });

  it('resolveTriple handles null start date', () => { const t = { start: null, end: dayjs('2026-01-05'), dur: null }; const result = resolveTriple(t, 'dur'); expect(result).toBeDefined(); });

  it('resolveTriple handles all null fields', () => { const t = { start: null, end: null, dur: null }; const result = resolveTriple(t, 'start'); expect(result).toBeDefined(); });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `2025-03-${String((index % 20) + 3).padStart(2, '0')}`,
    (index % 10) + 1,
  ] as const))(
    'resolveTriple computes generated end from start and duration %#',
    (startIso, dur) => {
      const start = d(startIso);
      const result = resolveTriple({ start, end: null, dur }, 'start');

      expect(result.start).toBe(start);
      expect(result.dur).toBe(dur);
      expect(result.end).not.toBeNull();
      expect(result.end!.isBefore(start, 'day')).toBe(false);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `2025-03-${String((index % 20) + 3).padStart(2, '0')}`,
    (index % 10) + 1,
  ] as const))(
    'resolveTriple computes generated start from end and duration %#',
    (endIso, dur) => {
      const end = d(endIso);
      const result = resolveTriple({ start: null, end, dur }, 'end');

      expect(result.start).not.toBeNull();
      expect(result.end).toBe(end);
      expect(result.dur).toBe(dur);
      expect(result.start!.isAfter(end, 'day')).toBe(false);
    },
  );
});
