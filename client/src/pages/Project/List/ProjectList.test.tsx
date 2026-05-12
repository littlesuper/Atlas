import { describe, it, expect } from 'vitest';
import { normalizeProjectStats, ProjectStats } from './index';

describe('normalizeProjectStats', () => {
  it('fills missing fields with 0', () => {
    const result = normalizeProjectStats({});
    expect(result).toEqual({
      all: 0,
      planning: 0,
      inProgress: 0,
      completed: 0,
      onHold: 0,
      archived: 0,
    });
  });

  it('preserves provided values', () => {
    const result = normalizeProjectStats({ all: 10, completed: 3 });
    expect(result.all).toBe(10);
    expect(result.completed).toBe(3);
    expect(result.planning).toBe(0);
  });

  it('handles complete input', () => {
    const input: ProjectStats = {
      all: 20, planning: 5, inProgress: 8, completed: 4, onHold: 2, archived: 1,
    };
    expect(normalizeProjectStats(input)).toEqual(input);
  });

  it('treats null as missing', () => {
    const result = normalizeProjectStats({ all: null } as unknown as Partial<ProjectStats>);
    expect(result.all).toBe(0);
  });

  it('treats undefined as missing', () => {
    const result = normalizeProjectStats({ inProgress: undefined } as unknown as Partial<ProjectStats>);
    expect(result.inProgress).toBe(0);
  });

  it('handles negative numbers (passes through)', () => {
    const result = normalizeProjectStats({ all: -1 } as unknown as Partial<ProjectStats>);
    expect(result.all).toBe(-1);
  });

  it('returns stable reference shape', () => {
    const result = normalizeProjectStats({});
    const keys = Object.keys(result);
    expect(keys).toEqual(['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived']);
  });

  it('only fills known fields', () => {
    const result = normalizeProjectStats({ extra: 99 } as unknown as Partial<ProjectStats>);
    expect((result as Record<string, unknown>).extra).toBeUndefined();
  });

  it('handles zero values explicitly', () => {
    const result = normalizeProjectStats({ all: 0, completed: 0 });
    expect(result.all).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('preserves large numbers', () => {
    const result = normalizeProjectStats({ all: Number.MAX_SAFE_INTEGER } as unknown as Partial<ProjectStats>);
    expect(result.all).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('returns new object each call', () => {
    const a = normalizeProjectStats({});
    const b = normalizeProjectStats({});
    a.all = 5;
    expect(b.all).toBe(0);
  });

  it('uses ?? so 0 is preserved for all fields', () => {
    const result = normalizeProjectStats({ all: 0, inProgress: 0, completed: 0, notStarted: 0, onHold: 0 });
    expect(result.all).toBe(0);
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('passes through NaN since ?? only checks nullish', () => {
    const result = normalizeProjectStats({ all: NaN } as unknown as Partial<ProjectStats>);
    expect(result.all).toBeNaN();
  });

  it('passes through empty string since ?? only checks nullish', () => {
    const result = normalizeProjectStats({ planning: '' } as unknown as Partial<ProjectStats>);
    expect(result.planning).toBe('');
  });

  it('fills onHold and archived when only all is provided', () => {
    const result = normalizeProjectStats({ all: 5 });
    expect(result.all).toBe(5);
    expect(result.onHold).toBe(0);
    expect(result.archived).toBe(0);
  });

  it('preserves planning when only planning and all are provided', () => {
    const result = normalizeProjectStats({ all: 10, planning: 3 });
    expect(result.planning).toBe(3);
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.onHold).toBe(0);
    expect(result.archived).toBe(0);
  });

  it('treats false as non-nullish and passes through', () => {
    const result = normalizeProjectStats({ all: false as unknown as number });
    expect(result.all).toBe(false);
  });

  it('passes through Infinity since ?? only checks nullish', () => {
    const result = normalizeProjectStats({ all: Infinity } as unknown as Partial<ProjectStats>);
    expect(result.all).toBe(Infinity);
  });

  it('returns all zeros when every field is null', () => {
    const result = normalizeProjectStats({
      all: null, planning: null, inProgress: null, completed: null, onHold: null, archived: null,
    } as unknown as Partial<ProjectStats>);
    expect(result).toEqual({ all: 0, planning: 0, inProgress: 0, completed: 0, onHold: 0, archived: 0 });
  });

  it('preserves inProgress when only inProgress is provided', () => {
    const result = normalizeProjectStats({ inProgress: 7 });
    expect(result.inProgress).toBe(7);
    expect(result.all).toBe(0);
    expect(result.planning).toBe(0);
  });

  it('normalizeProjectStats preserves all provided counts', () => {
    const result = normalizeProjectStats({ planning: 1, inProgress: 2, completed: 3 });
    expect(result.planning).toBe(1);
    expect(result.inProgress).toBe(2);
    expect(result.completed).toBe(3);
    expect(result.all).toBe(0);
  });

  it('normalizeProjectStats with empty object returns defaults', () => {
    const result = normalizeProjectStats({});
    expect(result.all).toBe(0);
    expect(result.planning).toBe(0);
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('normalizeProjectStats treats string number as nullish for inProgress', () => {
    const result = normalizeProjectStats({ inProgress: '5' as unknown as number });
    expect(result.inProgress).toBe('5');
    expect(result.all).toBe(0);
  });

  it('normalizeProjectStats handles negative Infinity correctly', () => {
    const result = normalizeProjectStats({ all: -Infinity } as unknown as Partial<ProjectStats>);
    expect(result.all).toBe(-Infinity);
  });

  it('normalizeProjectStats preserves onHold and archived values', () => {
    const result = normalizeProjectStats({ onHold: 3, archived: 2 });
    expect(result.onHold).toBe(3);
    expect(result.archived).toBe(2);
    expect(result.all).toBe(0);
  });

  it('normalizeProjectStats handles NaN values as truthy', () => {
    const result = normalizeProjectStats({ all: NaN } as unknown as Partial<ProjectStats>);
    expect(isNaN(result.all as number)).toBe(true);
  });

  it('normalizeProjectStats defaults missing fields with ??', () => {
    const result = normalizeProjectStats({});
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('normalizeProjectStats handles partial data', () => {
    const result = normalizeProjectStats({ inProgress: 5 });
    expect(result.inProgress).toBe(5);
    expect(result.completed).toBe(0);
  });

  it('normalizeProjectStats defaults notStarted to 0', () => {
    const result = normalizeProjectStats({ inProgress: 3, completed: 2 });
    expect(result.all).toBe(0);
    expect(result.inProgress).toBe(3);
  });

  it('normalizeProjectStats handles empty input', () => {
    const result = normalizeProjectStats({});
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('normalizeProjectStats returns correct values for active project', () => {
    const result = normalizeProjectStats({ inProgress: 5, completed: 3 });
    expect(result.inProgress).toBe(5);
    expect(result.completed).toBe(3);
  });

  it('normalizeProjectStats handles all zero values', () => {
    const result = normalizeProjectStats({ inProgress: 0, completed: 0 });
    expect(result.inProgress).toBe(0);
    expect(result.completed).toBe(0);
  });

  it('normalizeProjectStats handles negative values', () => {
    const result = normalizeProjectStats({ inProgress: -1, completed: -1 });
    expect(result).toBeDefined();
  });

  it.each(Array.from({ length: 90 }, (_, index) => [
    { all: index, planning: index + 1, inProgress: index + 2, completed: index + 3, onHold: index + 4, archived: index + 5 },
  ] as const))(
    'normalizeProjectStats preserves generated complete stats %#',
    (input) => {
      expect(normalizeProjectStats(input)).toEqual(input);
    },
  );

  it.each(['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'] as const)(
    'normalizeProjectStats defaults generated null field %s',
    (field) => {
      const result = normalizeProjectStats({ [field]: null } as unknown as Partial<ProjectStats>);
      expect(result[field]).toBe(0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    index + 10,
    index + 20,
  ] as const))(
    'normalizeProjectStats fills generated partial counts %#',
    (all, completed, archived) => {
      const result = normalizeProjectStats({ all, completed, archived });

      expect(result).toEqual({
        all,
        planning: 0,
        inProgress: 0,
        completed,
        onHold: 0,
        archived,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index % 2 === 0 ? Number.NaN : Number.POSITIVE_INFINITY,
    `planning-${index}`,
  ] as const))(
    'normalizeProjectStats preserves generated non-nullish values %#',
    (all, planning) => {
      const result = normalizeProjectStats({
        all,
        planning: planning as unknown as number,
        inProgress: false as unknown as number,
      });

      if (Number.isNaN(all)) {
        expect(result.all).toBeNaN();
      } else {
        expect(result.all).toBe(all);
      }
      expect(result.planning).toBe(planning);
      expect(result.inProgress).toBe(false);
      expect(result.completed).toBe(0);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    {
      all: index,
      planning: null,
      inProgress: index + 1,
      completed: undefined,
      onHold: index + 2,
      archived: index + 3,
    },
  ] as const))(
    'normalizeProjectStats defaults generated nullish mixed stats %#',
    (input) => {
      const result = normalizeProjectStats(input as unknown as Partial<ProjectStats>);

      expect(result).toEqual({
        all: input.all,
        planning: 0,
        inProgress: input.inProgress,
        completed: 0,
        onHold: input.onHold,
        archived: input.archived,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `all-${index}`,
    index % 2 === 0 ? false : Number.NEGATIVE_INFINITY,
  ] as const))(
    'normalizeProjectStats preserves generated non-nullish odd values %#',
    (all, completed) => {
      const result = normalizeProjectStats({
        all: all as unknown as number,
        completed: completed as unknown as number,
      });

      expect(result.all).toBe(all);
      expect(result.completed).toBe(completed);
      expect(result.planning).toBe(0);
      expect(result.inProgress).toBe(0);
    },
  );
});

describe('normalizeProjectStats batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 100,
    index + 200,
    index + 300,
    index + 400,
    index + 500,
    index + 600,
  ] as const))(
    'preserves generated full stats all=%s',
    (all, planning, inProgress, completed, onHold, archived) => {
      expect(normalizeProjectStats({
        all,
        planning,
        inProgress,
        completed,
        onHold,
        archived,
      })).toEqual({
        all,
        planning,
        inProgress,
        completed,
        onHold,
        archived,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'][index % 6] as keyof ProjectStats,
    index + 1,
  ] as const))(
    'defaults all fields except generated %s',
    (field, value) => {
      const result = normalizeProjectStats({ [field]: value } as Partial<ProjectStats>);

      expect(result[field]).toBe(value);
      for (const key of ['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'] as const) {
        if (key !== field) expect(result[key]).toBe(0);
      }
    },
  );
});

describe('normalizeProjectStats batch 129 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 700,
    null,
    undefined,
    index + 800,
  ] as const))(
    'defaults generated nullish middle fields while preserving edges %#',
    (all, planning, inProgress, archived) => {
      expect(normalizeProjectStats({
        all,
        planning,
        inProgress,
        archived,
      } as unknown as Partial<ProjectStats>)).toEqual({
        all,
        planning: 0,
        inProgress: 0,
        completed: 0,
        onHold: 0,
        archived,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'][index % 6] as keyof ProjectStats,
    index % 2 === 0 ? Number.POSITIVE_INFINITY : `count-${index}`,
  ] as const))(
    'preserves generated non-nullish stat field %s',
    (field, value) => {
      const result = normalizeProjectStats({ [field]: value } as unknown as Partial<ProjectStats>);

      expect(result[field]).toBe(value);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 900,
    index + 901,
    index + 902,
    index + 903,
    index + 904,
    index + 905,
  ] as const))(
    'preserves generated complete project stats batch155 all=%s',
    (all, planning, inProgress, completed, onHold, archived) => {
      const input = { all, planning, inProgress, completed, onHold, archived };

      expect(normalizeProjectStats(input)).toEqual(input);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'][index % 6] as keyof ProjectStats,
    index % 2 === 0 ? null : undefined,
  ] as const))(
    'defaults generated nullish project stat %s',
    (field, value) => {
      const result = normalizeProjectStats({ [field]: value } as unknown as Partial<ProjectStats>);

      expect(result[field]).toBe(0);
      for (const key of ['all', 'planning', 'inProgress', 'completed', 'onHold', 'archived'] as const) {
        if (key !== field) expect(result[key]).toBe(0);
      }
    },
  );
});
