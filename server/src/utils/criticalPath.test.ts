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
});
