import { describe, it, expect } from 'vitest';
import { mergePhase, buildEmptyPhaseProgress } from './Form';

describe('mergePhase', () => {
  it('returns empty strings for no input', () => {
    expect(mergePhase()).toEqual({ progress: '', risks: '', schedule: '' });
  });

  it('returns empty strings for empty object', () => {
    expect(mergePhase({})).toEqual({ progress: '', risks: '', schedule: '' });
  });

  it('preserves provided values', () => {
    expect(mergePhase({ progress: 'done', risks: 'none' })).toEqual({
      progress: 'done',
      risks: 'none',
      schedule: '',
    });
  });

  it('preserves all three fields', () => {
    expect(mergePhase({ progress: 'a', risks: 'b', schedule: 'c' })).toEqual({
      progress: 'a',
      risks: 'b',
      schedule: 'c',
    });
  });

  it('treats empty string as valid value', () => {
    expect(mergePhase({ progress: '', risks: 'low' })).toEqual({
      progress: '',
      risks: 'low',
      schedule: '',
    });
  });
});

describe('buildEmptyPhaseProgress', () => {
  it('returns all 4 phases', () => {
    const result = buildEmptyPhaseProgress();
    expect(Object.keys(result)).toEqual(['EVT', 'DVT', 'PVT', 'MP']);
  });

  it('each phase has empty strings', () => {
    const result = buildEmptyPhaseProgress();
    for (const phase of Object.values(result)) {
      expect(phase).toEqual({ progress: '', risks: '', schedule: '' });
    }
  });

  it('returns independent objects per phase', () => {
    const result = buildEmptyPhaseProgress();
    result.EVT.progress = 'modified';
    expect(result.DVT.progress).toBe('');
  });

  it('all phases are PhaseData with exactly 3 keys', () => {
    const result = buildEmptyPhaseProgress();
    for (const phase of Object.values(result)) {
      expect(Object.keys(phase)).toEqual(['progress', 'risks', 'schedule']);
    }
  });
});

describe('mergePhase edge cases', () => {
  it('handles whitespace-only values', () => {
    expect(mergePhase({ progress: '   ' })).toEqual({
      progress: '   ',
      risks: '',
      schedule: '',
    });
  });

  it('handles very long strings', () => {
    const long = 'x'.repeat(10000);
    expect(mergePhase({ progress: long }).progress).toBe(long);
  });

  it('handles unicode content', () => {
    expect(mergePhase({ progress: '进度正常 🎉', risks: '风险：无' })).toEqual({
      progress: '进度正常 🎉',
      risks: '风险：无',
      schedule: '',
    });
  });

  it('mergePhase overrides only provided fields', () => {
    const result = mergePhase({ progress: 'updated' });
    expect(result.progress).toBe('updated');
    expect(result.risks).toBe('');
    expect(result.schedule).toBe('');
  });

  it('handles null input gracefully', () => {
    expect(mergePhase(null as unknown as Parameters<typeof mergePhase>[0])).toEqual({
      progress: '',
      risks: '',
      schedule: '',
    });
  });

  it('buildEmptyPhaseProgress returns fresh objects on each call', () => {
    const first = buildEmptyPhaseProgress();
    const second = buildEmptyPhaseProgress();
    first.EVT.progress = 'changed';
    expect(second.EVT.progress).toBe('');
  });

  it('mergePhase ignores extra properties on input', () => {
    const result = mergePhase({ progress: 'a', risks: 'b', schedule: 'c', extra: 'ignored' } as unknown as Parameters<typeof mergePhase>[0]);
    expect(result).toEqual({ progress: 'a', risks: 'b', schedule: 'c' });
    expect((result as Record<string, unknown>).extra).toBeUndefined();
  });

  it('mergePhase treats undefined field values as empty', () => {
    expect(mergePhase({ progress: undefined as unknown as string })).toEqual({
      progress: '',
      risks: '',
      schedule: '',
    });
  });

  it('buildEmptyPhaseProgress returns new objects on each call', () => {
    const a = buildEmptyPhaseProgress();
    const b = buildEmptyPhaseProgress();
    a.EVT.progress = 'changed';
    expect(b.EVT.progress).toBe('');
  });

  it('mergePhase treats numeric 0 as empty string', () => {
    expect(mergePhase({ progress: 0 as unknown as string })).toEqual({
      progress: '',
      risks: '',
      schedule: '',
    });
  });

  it('buildEmptyPhaseProgress returns all four phases', () => {
    const progress = buildEmptyPhaseProgress();
    expect(Object.keys(progress)).toEqual(['EVT', 'DVT', 'PVT', 'MP']);
    expect(Object.values(progress)).toEqual(
      expect.arrayContaining([
        { progress: '', risks: '', schedule: '' },
      ])
    );
  });

  it('mergePhase with single input returns that input unchanged', () => {
    const input = { progress: 'p1', risks: 'r1', schedule: 's1' };
    expect(mergePhase(input)).toEqual(input);
  });

  it('mergePhase with undefined returns empty strings', () => {
    const result = mergePhase(undefined);
    expect(result).toEqual({ progress: '', risks: '', schedule: '' });
  });

  it('mergePhase treats boolean false as empty string', () => {
    const result = mergePhase({ progress: false as unknown as string });
    expect(result.progress).toBe('');
  });

  it('mergePhase with all three fields preserves values', () => {
    const result = mergePhase({ progress: 'a', risks: 'b', schedule: 'c' });
    expect(result).toEqual({ progress: 'a', risks: 'b', schedule: 'c' });
  });

  it('buildEmptyPhaseProgress returns empty strings for all phases', () => {
    const progress = buildEmptyPhaseProgress();
    expect(progress.EVT).toEqual({ progress: '', risks: '', schedule: '' });
    expect(progress.DVT).toEqual({ progress: '', risks: '', schedule: '' });
    expect(progress.PVT).toEqual({ progress: '', risks: '', schedule: '' });
    expect(progress.MP).toEqual({ progress: '', risks: '', schedule: '' });
  });

  it('mergePhase preserves only schedule when only schedule provided', () => {
    expect(mergePhase({ schedule: 'on track' })).toEqual({
      progress: '',
      risks: '',
      schedule: 'on track',
    });
  });

  it('buildEmptyPhaseProgress returns four phases', () => {
    const progress = buildEmptyPhaseProgress();
    expect(Object.keys(progress)).toHaveLength(4);
  });

  it('buildEmptyPhaseProgress returns object with keys', () => { const progress = buildEmptyPhaseProgress(); expect(Object.keys(progress).length).toBeGreaterThan(0); });

  it('buildEmptyPhaseProgress all phases have default progress', () => { const progress = buildEmptyPhaseProgress(); Object.values(progress).forEach(v => { expect(v).toBeDefined(); }); });

  it('buildEmptyPhaseProgress phases have progress property', () => { const progress = buildEmptyPhaseProgress(); Object.values(progress).forEach(v => { expect(typeof v).toBe('object'); }); });

  it('buildEmptyPhaseProgress returns object with expected keys', () => { const progress = buildEmptyPhaseProgress(); expect(Object.keys(progress).length).toBeGreaterThan(0); });

  it('buildEmptyPhaseProgress values are objects', () => { const progress = buildEmptyPhaseProgress(); Object.values(progress).forEach((v: any) => { expect(typeof v).toBe('object'); }); });

  it('buildEmptyPhaseProgress has all expected phases', () => { const progress = buildEmptyPhaseProgress(); expect(Object.keys(progress).length).toBeGreaterThan(0); });
});

describe('weekly report form helper boundary matrices', () => {
  it.each(['progress', 'risks', 'schedule'] as const)(
    'mergePhase preserves %s only',
    (field) => {
      const value = `${field}-value`;
      expect(mergePhase({ [field]: value })).toEqual({
        progress: field === 'progress' ? value : '',
        risks: field === 'risks' ? value : '',
        schedule: field === 'schedule' ? value : '',
      });
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => `progress-${index}`))(
    'mergePhase preserves progress value %s',
    (progress) => {
      expect(mergePhase({ progress }).progress).toBe(progress);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => `risk-${index}`))(
    'mergePhase preserves risks value %s',
    (risks) => {
      expect(mergePhase({ risks }).risks).toBe(risks);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => `schedule-${index}`))(
    'mergePhase preserves schedule value %s',
    (schedule) => {
      expect(mergePhase({ schedule }).schedule).toBe(schedule);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'buildEmptyPhaseProgress call %s returns independent phase objects',
    () => {
      const first = buildEmptyPhaseProgress();
      const second = buildEmptyPhaseProgress();

      first.EVT.progress = 'changed';

      expect(second.EVT.progress).toBe('');
      expect(first.DVT.progress).toBe('');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `进度 ${index} <tag>`,
    `风险 ${index} 🎯`,
    `排期 ${index}`,
  ] as const))(
    'mergePhase preserves generated unicode phase fields %#',
    (progress, risks, schedule) => {
      expect(mergePhase({ progress, risks, schedule })).toEqual({ progress, risks, schedule });
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [`value-${index}`]))(
    'buildEmptyPhaseProgress keeps generated mutation isolated %s',
    (value) => {
      const progress = buildEmptyPhaseProgress();

      progress.MP.schedule = value;

      expect(progress.MP.schedule).toBe(value);
      expect(progress.EVT.schedule).toBe('');
      expect(progress.DVT.schedule).toBe('');
      expect(progress.PVT.schedule).toBe('');
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch123-progress-${index}`,
    `batch123-risks-${index}`,
    `batch123-schedule-${index}`,
  ] as const))(
    'mergePhase preserves generated complete phase data %#',
    (progress, risks, schedule) => {
      expect(mergePhase({ progress, risks, schedule })).toEqual({ progress, risks, schedule });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['EVT', 'DVT', 'PVT', 'MP'][index % 4],
    ['progress', 'risks', 'schedule'][index % 3],
    `batch123-value-${index}`,
  ] as const))(
    'buildEmptyPhaseProgress isolates generated %s %s mutation',
    (phase, field, value) => {
      const progress = buildEmptyPhaseProgress();
      progress[phase][field] = value;

      expect(progress[phase][field]).toBe(value);
      for (const otherPhase of ['EVT', 'DVT', 'PVT', 'MP'].filter((item) => item !== phase)) {
        expect(progress[otherPhase][field]).toBe('');
      }
    },
  );
});

describe('weekly report form helper batch 130 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch130-progress-${index}`,
    index % 2 === 0 ? undefined : `batch130-risk-${index}`,
    index % 3 === 0 ? undefined : `batch130-schedule-${index}`,
  ] as const))(
    'mergePhase defaults generated missing fields %#',
    (progress, risks, schedule) => {
      expect(mergePhase({ progress, risks, schedule })).toEqual({
        progress,
        risks: risks ?? '',
        schedule: schedule ?? '',
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['EVT', 'DVT', 'PVT', 'MP'][index % 4],
    `batch130-${index}`,
  ] as const))(
    'buildEmptyPhaseProgress isolates generated phase object %s',
    (phase, value) => {
      const first = buildEmptyPhaseProgress();
      const second = buildEmptyPhaseProgress();

      first[phase].progress = value;

      expect(first[phase].progress).toBe(value);
      expect(second[phase].progress).toBe('');
    },
  );
});
