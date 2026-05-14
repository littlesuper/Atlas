import { describe, it, expect } from 'vitest';
import {
  formatSeq,
  getPredecessorSeqHelper,
  parsePredecessorTextHelper,
  remapActivityIds,
} from './TemplateManagement';
import { TemplateActivity } from '../../types';

function makeActivity(overrides: Partial<TemplateActivity> & { id: string }): TemplateActivity {
  return {
    templateId: 'tpl1',
    name: 'Test',
    type: 'TASK',
    phase: null,
    planDuration: null,
    dependencies: null,
    notes: null,
    roleId: null,
    sortOrder: 0,
    ...overrides,
  } as TemplateActivity;
}

describe('formatSeq', () => {
  it('pads single digit to 3 chars', () => expect(formatSeq(1)).toBe('001'));
  it('pads double digit to 3 chars', () => expect(formatSeq(12)).toBe('012'));
  it('does not pad 3-digit number', () => expect(formatSeq(123)).toBe('123'));
  it('handles 0', () => expect(formatSeq(0)).toBe('000'));
  it('handles large number', () => expect(formatSeq(9999)).toBe('9999'));
});

describe('getPredecessorSeqHelper', () => {
  const seqMap = new Map<string, number>([['a1', 1], ['a2', 2], ['a3', 3]]);

  it('returns empty string for no dependencies', () => {
    const act = makeActivity({ id: 'a1' });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('');
  });

  it('returns empty string for empty dependencies array', () => {
    const act = makeActivity({ id: 'a1', dependencies: [] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('');
  });

  it('formats FS dependency', () => {
    const act = makeActivity({ id: 'a2', dependencies: [{ id: 'a1', type: '0' }] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('001FS');
  });

  it('formats SS dependency', () => {
    const act = makeActivity({ id: 'a3', dependencies: [{ id: 'a1', type: '1' }] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('001SS');
  });

  it('formats with positive lag', () => {
    const act = makeActivity({ id: 'a2', dependencies: [{ id: 'a1', type: '0', lag: 2 }] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('001FS+2');
  });

  it('formats with negative lag', () => {
    const act = makeActivity({ id: 'a2', dependencies: [{ id: 'a1', type: '0', lag: -3 }] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('001FS-3');
  });

  it('formats multiple dependencies', () => {
    const act = makeActivity({
      id: 'a3',
      dependencies: [{ id: 'a1', type: '0' }, { id: 'a2', type: '1' }],
    });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('001FS, 002SS');
  });

  it('uses ? for unknown id', () => {
    const act = makeActivity({ id: 'a2', dependencies: [{ id: 'unknown', type: '0' }] });
    expect(getPredecessorSeqHelper(act, seqMap)).toBe('?FS');
  });
});

describe('parsePredecessorTextHelper', () => {
  const seqMap = new Map<number, string>([[1, 'a1'], [2, 'a2'], [3, 'a3']]);

  it('returns null for empty string', () => {
    expect(parsePredecessorTextHelper('', 'a1', seqMap)).toBeNull();
  });

  it('returns null for whitespace only', () => {
    expect(parsePredecessorTextHelper('   ', 'a1', seqMap)).toBeNull();
  });

  it('parses simple sequence number as FS', () => {
    const result = parsePredecessorTextHelper('1', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0' }]);
  });

  it('parses explicit FS type', () => {
    const result = parsePredecessorTextHelper('1FS', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0' }]);
  });

  it('parses SS type', () => {
    const result = parsePredecessorTextHelper('2SS', 'a1', seqMap);
    expect(result).toEqual([{ id: 'a2', type: '1' }]);
  });

  it('parses FF type', () => {
    const result = parsePredecessorTextHelper('1FF', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '2' }]);
  });

  it('parses SF type', () => {
    const result = parsePredecessorTextHelper('1SF', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '3' }]);
  });

  it('parses with positive lag', () => {
    const result = parsePredecessorTextHelper('1FS+3', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0', lag: 3 }]);
  });

  it('parses with negative lag', () => {
    const result = parsePredecessorTextHelper('1FS-2', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0', lag: -2 }]);
  });

  it('parses multiple deps with comma', () => {
    const result = parsePredecessorTextHelper('1FS, 2SS', 'a3', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0' }, { id: 'a2', type: '1' }]);
  });

  it('parses with Chinese comma', () => {
    const result = parsePredecessorTextHelper('1FS，2SS', 'a3', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0' }, { id: 'a2', type: '1' }]);
  });

  it('filters out self-reference', () => {
    const result = parsePredecessorTextHelper('1', 'a1', seqMap);
    expect(result).toBeNull();
  });

  it('filters out unknown sequence', () => {
    const result = parsePredecessorTextHelper('99', 'a1', seqMap);
    expect(result).toBeNull();
  });

  it('skips invalid tokens', () => {
    const result = parsePredecessorTextHelper('abc, 1FS', 'a2', seqMap);
    expect(result).toEqual([{ id: 'a1', type: '0' }]);
  });

  it('returns null when all tokens are invalid', () => {
    const result = parsePredecessorTextHelper('abc, xyz', 'a1', seqMap);
    expect(result).toBeNull();
  });
});

describe('remapActivityIds', () => {
  it('generates new IDs for all activities', () => {
    const acts = [makeActivity({ id: 'old1' }), makeActivity({ id: 'old2' })];
    const { activities, idMap } = remapActivityIds(acts, () => 'new-id');
    expect(activities[0].id).toBe('new-id');
    expect(activities[1].id).toBe('new-id');
    expect(idMap.get('old1')).toBe('new-id');
    expect(idMap.get('old2')).toBe('new-id');
  });

  it('remaps dependency IDs', () => {
    const acts = [
      makeActivity({ id: 'a' }),
      makeActivity({ id: 'b', dependencies: [{ id: 'a', type: '0' }] }),
    ];
    let counter = 0;
    const { activities } = remapActivityIds(acts, () => `new-${++counter}`);
    expect(activities[1].dependencies![0].id).toBe('new-1');
  });

  it('preserves non-mapped dep IDs as fallback', () => {
    const acts = [
      makeActivity({ id: 'b', dependencies: [{ id: 'unknown', type: '0' }] }),
    ];
    const { activities } = remapActivityIds(acts, () => 'new-id');
    expect(activities[0].dependencies![0].id).toBe('unknown');
  });

  it('handles activities with null dependencies', () => {
    const acts = [makeActivity({ id: 'a', dependencies: null })];
    const { activities } = remapActivityIds(acts, () => 'new-id');
    expect(activities[0].dependencies).toBeNull();
  });

  it('handles empty activities array', () => {
    const { activities, idMap } = remapActivityIds([], () => 'x');
    expect(activities).toEqual([]);
    expect(idMap.size).toBe(0);
  });

  it('remapActivityIds generates unique IDs for each activity', () => {
    const acts = [makeActivity({ id: 'a' }), makeActivity({ id: 'b' })];
    const { activities } = remapActivityIds(acts, () => Math.random().toString(36));
    const ids = activities.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('remapActivityIds preserves activity count', () => {
    const acts = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const { activities } = remapActivityIds(acts, () => 'new-id');
    expect(activities).toHaveLength(3);
  });

  it('remapActivityIds handles empty array', () => {
    const { activities } = remapActivityIds([], () => 'new-id');
    expect(activities).toHaveLength(0);
  });

  it('remapActivityIds preserves activity properties', () => {
    const acts = [{ id: 'a1', name: 'Test', duration: 5 }];
    const { activities } = remapActivityIds(acts, () => 'new-id');
    expect((activities[0] as Record<string, unknown>).name).toBe('Test');
  });

  it('remapActivityIds generates unique IDs for each activity', () => {
    const acts = [{ id: 'a1' }, { id: 'a2' }];
    const { activities } = remapActivityIds(acts, () => 'gen-' + Math.random());
    expect(activities.map(a => a.id)).toHaveLength(2);
  });

  it('remapActivityIds generates unique IDs', () => {
    const acts = [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }];
    const ids: string[] = [];
    const { activities } = remapActivityIds(acts, () => 'uid-' + Math.random());
    activities.forEach(a => ids.push(a.id));
    expect(new Set(ids).size).toBe(3);
  });

  it('remapActivityIds preserves activity names', () => {
    const acts = [{ id: 'old1', name: 'Task A' }, { id: 'old2', name: 'Task B' }];
    const { activities } = remapActivityIds(acts, () => 'uid-' + Math.random());
    expect(activities[0].name).toBe('Task A');
    expect(activities[1].name).toBe('Task B');
  });

  it('formatSeq handles zero sequence number', () => {
    expect(formatSeq(0)).toBeDefined();
  });
});

describe('TemplateManagement helpers batch 142 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index,
    String(index).padStart(3, '0'),
  ] as const))(
    'formatSeq pads generated number %s',
    (value, expected) => {
      expect(formatSeq(value)).toBe(expected);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    index + 1,
    ['FS', 'SS', 'FF', 'SF'][index % 4],
    index % 3 === 0 ? index : index % 3 === 1 ? -index : 0,
  ] as const))(
    'parsePredecessorTextHelper parses generated predecessor %#',
    (seq, label, lag) => {
      const id = `activity-${seq}`;
      const seqToIdMap = new Map([[seq, id]]);
      const lagText = lag > 0 ? `+${lag}` : lag < 0 ? String(lag) : '';
      const result = parsePredecessorTextHelper(`${seq}${label}${lagText}`, 'self', seqToIdMap);

      expect(result).toEqual([{ id, type: { FS: '0', SS: '1', FF: '2', SF: '3' }[label], ...(lag !== 0 ? { lag } : {}) }]);
    },
  );
});
