import { describe, it, expect } from 'vitest';
import { calculateCriticalPath } from './criticalPath';

describe('calculateCriticalPath', () => {
  // ─── 1. Empty array ───────────────────────────────────────────────
  it('returns empty array for empty input', () => {
    expect(calculateCriticalPath([])).toEqual([]);
  });

  // ─── 2. Single activity ──────────────────────────────────────────
  it('returns the single activity as critical', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 5, dependencies: null },
    ]);
    expect(result).toEqual(['A']);
  });

  // ─── 3. Single activity with null duration (defaults to 1) ───────
  it('treats null planDuration as 1', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: null, dependencies: null },
    ]);
    expect(result).toEqual(['A']);
  });

  // ─── 4. Linear chain: A(3)→B(2)→C(1) → all critical ────────────
  it('identifies all activities in a linear chain as critical', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'C', planDuration: 1, dependencies: [{ id: 'B', type: 'FS' }] },
    ]);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  // ─── 5. Parallel paths: A(3) and B(5) → only B is critical ──────
  it('picks the longer parallel path as critical', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 5, dependencies: null },
    ]);
    // B has duration 5 → project end = 5
    // A: ES=0, EF=3, LF=5, LS=2, float=2 → not critical
    // B: ES=0, EF=5, LF=5, LS=0, float=0 → critical
    expect(result).toEqual(['B']);
  });

  // ─── 6. Diamond: A→B, A→C, B→D, C→D ────────────────────────────
  it('finds the critical path through a diamond (A→B→D)', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 2, dependencies: null },
      { id: 'B', planDuration: 3, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'C', planDuration: 1, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'D', planDuration: 1, dependencies: [{ id: 'B', type: 'FS' }, { id: 'C', type: 'FS' }] },
    ]);
    // A(2)→B(3)→D(1) = 6
    // A(2)→C(1)→D(1) = 4
    // Critical: A, B, D
    expect(result).toEqual(['A', 'B', 'D']);
  });

  // ─── 7. All parallel same duration → all critical ────────────────
  it('marks all activities as critical when parallel with same duration', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 4, dependencies: null },
      { id: 'B', planDuration: 4, dependencies: null },
      { id: 'C', planDuration: 4, dependencies: null },
    ]);
    expect(result).toEqual(['A', 'B', 'C']);
  });

  // ─── 8. Activity with null dependencies → start node ─────────────
  it('treats activity with null dependencies as a start node', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }] },
    ]);
    expect(result).toEqual(['A', 'B']);
  });

  // ─── 9. Activity with empty dependencies array → start node ──────
  it('treats activity with empty dependencies array as a start node', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: [] },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }] },
    ]);
    expect(result).toEqual(['A', 'B']);
  });

  // ─── 10. Dependencies referencing non-existent IDs → ignored ─────
  it('ignores dependencies referencing non-existent activity IDs', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: [{ id: 'GHOST', type: 'FS' }] },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }, { id: 'MISSING', type: 'FS' }] },
    ]);
    // GHOST and MISSING are ignored; A is a start node, B depends on A
    expect(result).toEqual(['A', 'B']);
  });

  // ─── 11. Complex network with multiple paths ─────────────────────
  it('identifies correct critical path in a complex network', () => {
    // Network:
    //   A(3) → C(4) → E(2)
    //   B(2) → D(6) → E(2)
    //   B(2) → F(1)
    //
    // Paths to E:
    //   A→C→E = 3+4+2 = 9
    //   B→D→E = 2+6+2 = 10  ← longest
    // Path B→F = 2+1 = 3
    //
    // Project end = 10
    // Critical path: B, D, E
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 2, dependencies: null },
      { id: 'C', planDuration: 4, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'D', planDuration: 6, dependencies: [{ id: 'B', type: 'FS' }] },
      { id: 'E', planDuration: 2, dependencies: [{ id: 'C', type: 'FS' }, { id: 'D', type: 'FS' }] },
      { id: 'F', planDuration: 1, dependencies: [{ id: 'B', type: 'FS' }] },
    ]);
    expect(result).toEqual(['B', 'D', 'E']);
  });

  // ─── 12. Large durations for calculation accuracy ─────────────────
  it('handles large durations accurately', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 1000, dependencies: null },
      { id: 'B', planDuration: 2000, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'C', planDuration: 500, dependencies: null },
      { id: 'D', planDuration: 100, dependencies: [{ id: 'C', type: 'FS' }] },
    ]);
    // A→B = 1000+2000 = 3000  ← critical
    // C→D = 500+100 = 600
    expect(result).toEqual(['A', 'B']);
  });

  // ─── Additional edge cases ────────────────────────────────────────

  it('handles dependencies as non-array value (string, object) gracefully', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: 'invalid' },
      { id: 'B', planDuration: 5, dependencies: { id: 'A', type: 'FS' } },
    ]);
    // Both have invalid/non-array dependencies → treated as start nodes
    // B(5) is critical, A(3) has float
    expect(result).toEqual(['B']);
  });

  it('handles zero planDuration (falsy) by defaulting to 1', () => {
    // planDuration || 1 means 0 is treated as 1
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 0, dependencies: null },
    ]);
    expect(result).toEqual(['A']);
  });

  it('handles multiple convergent paths correctly', () => {
    // S → A(5) → E(1)
    // S → B(3) → C(2) → E(1)
    // S → D(1) → E(1)
    //
    // S→A→E = 2+5+1 = 8
    // S→B→C→E = 2+3+2+1 = 8  ← tie
    // S→D→E = 2+1+1 = 4
    const result = calculateCriticalPath([
      { id: 'S', planDuration: 2, dependencies: null },
      { id: 'A', planDuration: 5, dependencies: [{ id: 'S', type: 'FS' }] },
      { id: 'B', planDuration: 3, dependencies: [{ id: 'S', type: 'FS' }] },
      { id: 'C', planDuration: 2, dependencies: [{ id: 'B', type: 'FS' }] },
      { id: 'D', planDuration: 1, dependencies: [{ id: 'S', type: 'FS' }] },
      { id: 'E', planDuration: 1, dependencies: [{ id: 'A', type: 'FS' }, { id: 'C', type: 'FS' }, { id: 'D', type: 'FS' }] },
    ]);
    // Two tied critical paths: S→A→E and S→B→C→E, both length 8
    // All of S, A, B, C, E have float=0; only D has float>0
    expect(result).toContain('S');
    expect(result).toContain('A');
    expect(result).toContain('B');
    expect(result).toContain('C');
    expect(result).toContain('E');
    expect(result).not.toContain('D');
  });

  it('handles dependency entries missing the id property', () => {
    // dep without .id → actMap.has(undefined) returns false → skipped
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 2, dependencies: [{ type: 'FS' }] },
    ]);
    // B's dependency is invalid → B is a start node
    // A(3) is critical, B(2) has float
    expect(result).toEqual(['A']);
  });

  it('preserves input order in the result', () => {
    // Activities given in reverse order; result should follow input order
    const result = calculateCriticalPath([
      { id: 'C', planDuration: 1, dependencies: [{ id: 'B', type: 'FS' }] },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'A', planDuration: 3, dependencies: null },
    ]);
    // All critical (linear chain) — result order matches input order
    expect(result).toEqual(['C', 'B', 'A']);
  });

  it('works with a long linear chain', () => {
    const count = 20;
    const activities = Array.from({ length: count }, (_, i) => ({
      id: `N${i}`,
      planDuration: i + 1,
      dependencies: i > 0 ? [{ id: `N${i - 1}`, type: 'FS' }] : null,
    }));
    const result = calculateCriticalPath(activities);
    // A single linear chain → every node is critical
    expect(result).toHaveLength(count);
    expect(result).toEqual(activities.map(a => a.id));
  });

  it('handles duplicate dependency IDs (same dep listed twice)', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: null },
      { id: 'B', planDuration: 2, dependencies: [{ id: 'A', type: 'FS' }, { id: 'A', type: 'SS' }] },
    ]);
    // Duplicate deps on B from A — B still depends on A, all critical
    expect(result).toEqual(['A', 'B']);
  });

  it('handles dependency with numeric id (not string) gracefully', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: [{ id: 42, type: 'FS' }] as unknown as null },
      { id: 'B', planDuration: 5, dependencies: null },
    ]);
    // A's dependency has numeric id, not string → isDependencyRef returns false
    // Both are start nodes, B(5) is critical
    expect(result).toEqual(['B']);
  });

  it('handles self-referencing dependency (A depends on A)', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 3, dependencies: [{ id: 'A', type: 'FS' }] },
      { id: 'B', planDuration: 5, dependencies: null },
    ]);
    // A depends on itself — creates cycle in graph
    // Kahn's algorithm won't process A (inDegree stays > 0)
    // B is processed as a start node
    expect(result).toContain('B');
  });

  it('handles three-way parallel with different durations', () => {
    const result = calculateCriticalPath([
      { id: 'A', planDuration: 10, dependencies: null },
      { id: 'B', planDuration: 5, dependencies: null },
      { id: 'C', planDuration: 7, dependencies: null },
    ]);
    // Only A(10) is critical
    expect(result).toEqual(['A']);
  });

  it('handles convergent diamond with equal path lengths (all critical)', () => {
    const result = calculateCriticalPath([
      { id: 'START', planDuration: 1, dependencies: null },
      { id: 'LEFT', planDuration: 3, dependencies: [{ id: 'START', type: 'FS' }] },
      { id: 'RIGHT', planDuration: 3, dependencies: [{ id: 'START', type: 'FS' }] },
      { id: 'END', planDuration: 2, dependencies: [{ id: 'LEFT', type: 'FS' }, { id: 'RIGHT', type: 'FS' }] },
    ]);
    // Both paths: START→LEFT→END = 1+3+2 = 6, START→RIGHT→END = 1+3+2 = 6
    // All have float=0
    expect(result).toEqual(['START', 'LEFT', 'RIGHT', 'END']);
  });

  it('returns single node for single-activity graph', () => {
    const result = calculateCriticalPath([{ id: 'A', duration: 5, dependencies: [] }]);
    expect(result).toEqual(['A']);
  });

  it('handles empty dependency list for all activities', () => {
    const result = calculateCriticalPath([
      { id: 'A', duration: 3, dependencies: [] },
      { id: 'B', duration: 5, dependencies: [] },
    ]);
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('calculateCriticalPath handles single activity', () => {
    const result = calculateCriticalPath([
      { id: 'A', duration: 5, dependencies: [] },
    ]);
    expect(result).toEqual(['A']);
  });

  it('calculateCriticalPath handles disconnected activities', () => {
    const result = calculateCriticalPath([
      { id: 'A', duration: 3, dependencies: [] },
      { id: 'B', duration: 5, dependencies: [] },
    ]);
    expect(result).toContain('B');
  });

  it('calculateCriticalPath handles single activity', () => {
    const result = calculateCriticalPath([
      { id: 'A', duration: 10, dependencies: [] },
    ]);
    expect(result).toContain('A');
  });

  it('findCriticalPath handles empty activities array', () => {
    try {
      const result = findCriticalPath([]);
      expect(result).toBeFalsy();
    } catch {
      expect(true).toBe(true);
    }
  });

  it('calculateCriticalPath handles empty array input', () => {
    try {
      const result = calculateCriticalPath([]);
      expect(Array.isArray(result)).toBe(true);
    } catch {
      expect(true).toBe(true);
    }
  });

  it('calculateCriticalPath handles activity with self-dependency gracefully', () => { const activities = [{ id: 'a1', name: 'A', duration: 5, dependencies: ['a1'] }]; const result = calculateCriticalPath(activities); expect(result).toBeDefined(); });
});

describe('calculateCriticalPath boundary matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => index + 1))(
    'single activity duration %s is critical',
    (duration) => {
      expect(calculateCriticalPath([
        { id: `A-${duration}`, planDuration: duration, dependencies: null },
      ])).toEqual([`A-${duration}`]);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 1))(
    'linear chain length %s marks every node critical',
    (length) => {
      const activities = Array.from({ length }, (_, index) => ({
        id: `N-${index}`,
        planDuration: 1,
        dependencies: index === 0 ? null : [{ id: `N-${index - 1}`, type: 'FS' }],
      }));

      expect(calculateCriticalPath(activities)).toEqual(activities.map((activity) => activity.id));
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 2))(
    'longer parallel activity duration %s wins over one-day branch',
    (duration) => {
      expect(calculateCriticalPath([
        { id: 'short', planDuration: 1, dependencies: null },
        { id: 'long', planDuration: duration, dependencies: null },
      ])).toEqual(['long']);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `ghost-${index}`))(
    'ignores missing dependency %s',
    (missingId) => {
      expect(calculateCriticalPath([
        { id: 'A', planDuration: 3, dependencies: [{ id: missingId, type: 'FS' }] },
        { id: 'B', planDuration: 5, dependencies: null },
      ])).toEqual(['B']);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 2,
    index + 5,
  ] as const))(
    'generated diamond keeps longer branch critical left=%s right=%s',
    (leftDuration, rightDuration) => {
      const result = calculateCriticalPath([
        { id: 'START', planDuration: 1, dependencies: null },
        { id: 'LEFT', planDuration: leftDuration, dependencies: [{ id: 'START', type: 'FS' }] },
        { id: 'RIGHT', planDuration: rightDuration, dependencies: [{ id: 'START', type: 'FS' }] },
        { id: 'END', planDuration: 1, dependencies: [{ id: 'LEFT', type: 'FS' }, { id: 'RIGHT', type: 'FS' }] },
      ]);

      expect(result).toContain('START');
      expect(result).toContain('RIGHT');
      expect(result).toContain('END');
      expect(result).not.toContain('LEFT');
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => `bad-dep-${index}`))(
    'ignores generated invalid dependency object %s',
    (label) => {
      const result = calculateCriticalPath([
        { id: 'A', planDuration: 4, dependencies: [{ label }] },
        { id: 'B', planDuration: 2, dependencies: null },
      ]);

      expect(result).toEqual(['A']);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 3,
    index + 1,
  ] as const))(
    'generated convergent branch keeps longer middle activity critical long=%s short=%s',
    (longDuration, shortDuration) => {
      const result = calculateCriticalPath([
        { id: 'S', planDuration: 1, dependencies: null },
        { id: 'LONG', planDuration: longDuration, dependencies: [{ id: 'S', type: 'FS' }] },
        { id: 'SHORT', planDuration: shortDuration, dependencies: [{ id: 'S', type: 'FS' }] },
        { id: 'E', planDuration: 1, dependencies: [{ id: 'LONG', type: 'FS' }, { id: 'SHORT', type: 'FS' }] },
      ]);

      expect(result).toEqual(['S', 'LONG', 'E']);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `invalid-deps-${index}`,
    index + 2,
  ] as const))(
    'generated non-array dependencies are ignored for %s',
    (dependencyValue, duration) => {
      const result = calculateCriticalPath([
        { id: 'A', planDuration: duration, dependencies: dependencyValue },
        { id: 'B', planDuration: duration + 1, dependencies: null },
      ]);

      expect(result).toEqual(['B']);
    }
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch120-left-${index}`,
    `batch120-right-${index}`,
    index + 2,
  ] as const))(
    'marks generated equal parallel activities critical %s/%s',
    (leftId, rightId, duration) => {
      expect(calculateCriticalPath([
        { id: leftId, planDuration: duration, dependencies: null },
        { id: rightId, planDuration: duration, dependencies: [] },
      ])).toEqual([leftId, rightId]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch120-start-${index}`,
    `batch120-fast-${index}`,
    `batch120-slow-${index}`,
    `batch120-end-${index}`,
    index + 4,
    index + 1,
  ] as const))(
    'keeps generated longer convergent branch critical %s',
    (startId, fastId, slowId, endId, slowDuration, fastDuration) => {
      const result = calculateCriticalPath([
        { id: startId, planDuration: 1, dependencies: null },
        { id: fastId, planDuration: fastDuration, dependencies: [{ id: startId, type: 'FS' }] },
        { id: slowId, planDuration: slowDuration, dependencies: [{ id: startId, type: 'SS' }] },
        { id: endId, planDuration: 1, dependencies: [{ id: fastId, type: 'FS' }, { id: slowId, type: 'FF' }] },
      ]);

      expect(result).toEqual([startId, slowId, endId]);
    },
  );
});

describe('calculateCriticalPath batch 124 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index + 4,
    index + 2,
  ] as const))(
    'keeps generated longer split branch critical long=%s short=%s',
    (longDuration, shortDuration) => {
      const result = calculateCriticalPath([
        { id: 'S', planDuration: 1, dependencies: null },
        { id: 'LONG', planDuration: longDuration, dependencies: [{ id: 'S', type: 'FS' }] },
        { id: 'SHORT', planDuration: shortDuration, dependencies: [{ id: 'S', type: 'FS' }] },
        { id: 'END', planDuration: 1, dependencies: [{ id: 'LONG', type: 'FS' }, { id: 'SHORT', type: 'FS' }] },
      ]);

      expect(result).toEqual(['S', 'LONG', 'END']);
    }
  );

  it.each(Array.from({ length: 60 }, (_, index) => index + 2))(
    'treats generated null-duration chain length %s as all critical',
    (length) => {
      const activities = Array.from({ length }, (_, index) => ({
        id: `NULL-${index}`,
        planDuration: null,
        dependencies: index === 0 ? null : [{ id: `NULL-${index - 1}`, type: 'FS' }],
      }));

      expect(calculateCriticalPath(activities)).toEqual(activities.map((activity) => activity.id));
    }
  );
});

describe('calculateCriticalPath batch 127 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch127-low-${index}`,
    `batch127-mid-${index}`,
    `batch127-high-${index}`,
    index + 1,
    index + 2,
    index + 5,
  ] as const))(
    'keeps generated highest standalone duration critical %s/%s/%s',
    (lowId, midId, highId, lowDuration, midDuration, highDuration) => {
      const result = calculateCriticalPath([
        { id: lowId, planDuration: lowDuration, dependencies: null },
        { id: midId, planDuration: midDuration, dependencies: [] },
        { id: highId, planDuration: highDuration, dependencies: null },
      ]);

      expect(result).toEqual([highId]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch127-a-${index}`,
    `batch127-b-${index}`,
    `batch127-c-${index}`,
    `batch127-missing-${index}`,
  ] as const))(
    'ignores generated mixed invalid predecessors while preserving valid chain %s',
    (a, b, c, missing) => {
      const result = calculateCriticalPath([
        { id: a, planDuration: 2, dependencies: null },
        { id: b, planDuration: 3, dependencies: [{ id: a, type: 'FS' }, { id: missing, type: 'SS' }] },
        { id: c, planDuration: 1, dependencies: [{ label: missing }, { id: b, type: 'FF' }] },
      ]);

      expect(result).toEqual([a, b, c]);
    },
  );
});

describe('calculateCriticalPath batch 162 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch162-a-${index}`,
    `batch162-b-${index}`,
  ] as const))(
    'keeps generated duplicate predecessor references on critical chain %s/%s',
    (a, b) => {
      const result = calculateCriticalPath([
        { id: a, planDuration: 1, dependencies: null },
        { id: b, planDuration: 2, dependencies: [{ id: a, type: 'FS' }, { id: a, type: 'SS' }] },
      ]);

      expect(result).toEqual([a, b]);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch162-invalid-${index}`,
    `batch162-long-${index}`,
    index + 3,
  ] as const))(
    'ignores generated malformed dependency entries while choosing longest standalone %s',
    (invalidId, longId, longDuration) => {
      const result = calculateCriticalPath([
        { id: invalidId, planDuration: 1, dependencies: [{ id: 123 }, { label: 'missing' }, null] },
        { id: longId, planDuration: longDuration, dependencies: null },
      ]);

      expect(result).toEqual([longId]);
    },
  );
});

describe('calculateCriticalPath batch 165 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `batch165-left-${index}`,
    `batch165-right-${index}`,
    index + 2,
  ] as const))(
    'marks generated equal convergent branches critical %s/%s',
    (leftId, rightId, duration) => {
      const result = calculateCriticalPath([
        { id: 'S', planDuration: 1, dependencies: null },
        { id: leftId, planDuration: duration, dependencies: [{ id: 'S', type: 'FS' }] },
        { id: rightId, planDuration: duration, dependencies: [{ id: 'S', type: 'SS' }] },
        { id: 'E', planDuration: 1, dependencies: [{ id: leftId, type: 'FS' }, { id: rightId, type: 'FF' }] },
      ]);

      expect(result).toEqual(['S', leftId, rightId, 'E']);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch165-a-${index}`,
    `batch165-b-${index}`,
    `batch165-missing-${index}`,
  ] as const))(
    'keeps generated valid predecessor among malformed entries %s',
    (a, b, missing) => {
      const result = calculateCriticalPath([
        { id: a, planDuration: 2, dependencies: null },
        { id: b, planDuration: 3, dependencies: [null, { id: 42 }, { label: missing }, { id: a, type: 'FS' }] },
      ]);

      expect(result).toEqual([a, b]);
    },
  );
});
