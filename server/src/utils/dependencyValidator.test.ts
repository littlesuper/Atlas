import { describe, it, expect } from 'vitest';
import { detectCircularDependency } from './dependencyValidator';

/**
 * Helper: creates a mock prisma object whose activity.findMany returns
 * the supplied activities array.
 */
function mockPrisma(activities: { id: string; dependencies: unknown }[]) {
  return {
    activity: {
      findMany: async () => activities,
    },
  } as any;
}

describe('detectCircularDependency', () => {
  // ── 1. Empty project (no activities) → false ──────────────────────────
  it('returns false for an empty project with no activities', async () => {
    const prisma = mockPrisma([]);
    const result = await detectCircularDependency(
      'project-1',
      'a1',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 2. Single activity, no deps → false ───────────────────────────────
  it('returns false for a single activity with no dependencies', async () => {
    const prisma = mockPrisma([{ id: 'a1', dependencies: [] }]);
    const result = await detectCircularDependency(
      'project-1',
      'a1',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 3. Linear chain A→B→C → false ────────────────────────────────────
  it('returns false for a linear dependency chain A→B→C', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [] },
    ]);
    // We set a's deps to [b] (same as existing), no cycle
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 4. Direct cycle A→B→A → true ─────────────────────────────────────
  it('returns true for a direct cycle A→B→A', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    // Setting a's deps to [b] creates A→B→A
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  // ── 5. Indirect cycle A→B→C→A → true ─────────────────────────────────
  it('returns true for an indirect cycle A→B→C→A', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    // Setting a's deps to [b] creates A→B→C→A
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  // ── 6. Self-dependency A→A → true ─────────────────────────────────────
  it('returns true for a self-dependency A→A', async () => {
    const prisma = mockPrisma([{ id: 'a', dependencies: [] }]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'a', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  // ── 7. New deps create cycle in previously acyclic graph → true ───────
  it('returns true when new deps introduce a cycle into an acyclic graph', async () => {
    // Existing graph: A→B, C→D (acyclic, two separate chains)
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'd', dependencies: [] },
    ]);
    // Setting d's deps to [a] while also a→b is fine, but if we set b's deps to [c]
    // that creates A→B→C→D — still acyclic.
    // Instead: set d's deps to [c] creates C→D→C cycle.
    const result = await detectCircularDependency(
      'project-1',
      'd',
      [{ id: 'c', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  it('confirms previously acyclic graph has no cycle without the new dep', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'd', dependencies: [] },
    ]);
    // Without the problematic new dep, no cycle
    const result = await detectCircularDependency(
      'project-1',
      'd',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 8. Removing deps (empty newDeps) breaks cycle → false ─────────────
  it('returns false when removing deps breaks an existing cycle', async () => {
    // Existing graph has cycle: A→B, B→C, C→A
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    // Clearing c's deps breaks the cycle
    const result = await detectCircularDependency(
      'project-1',
      'c',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('confirms the cycle exists before removing deps', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    // Keep c's dep on a → cycle remains
    const result = await detectCircularDependency(
      'project-1',
      'c',
      [{ id: 'a', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  // ── 9. Multiple disconnected components → false ───────────────────────
  it('returns false for multiple disconnected acyclic components', async () => {
    const prisma = mockPrisma([
      // Component 1: A→B
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [] },
      // Component 2: C→D→E
      { id: 'c', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'd', dependencies: [{ id: 'e', type: 'FS' }] },
      { id: 'e', dependencies: [] },
      // Component 3: F (isolated)
      { id: 'f', dependencies: [] },
    ]);
    // Add an innocuous dep within component 2, no cross-component cycle
    const result = await detectCircularDependency(
      'project-1',
      'e',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 10. Dependencies referencing non-existent activities → false ──────
  it('returns false when dependencies reference non-existent activities', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
    ]);
    // a depends on "ghost" which doesn't exist in the project
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'ghost', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('returns false when existing activities have deps on non-existent activities', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'nonexistent', type: 'FS' }] },
      { id: 'b', dependencies: [] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'b',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── 11. Activities with null/undefined dependencies → handled gracefully
  it('handles activities with null dependencies', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: null },
      { id: 'b', dependencies: null },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('handles activities with undefined dependencies', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: undefined },
      { id: 'b', dependencies: undefined },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('handles a mix of null, undefined, and valid dependencies', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: null },
      { id: 'b', dependencies: undefined },
      { id: 'c', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  // ── Additional edge cases ─────────────────────────────────────────────

  it('handles dependency with lag property', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: [] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS', lag: 2 }, { id: 'c', type: 'SS', lag: -1 }],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('detects a longer cycle: A→B→C→D→E→A', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'd', dependencies: [{ id: 'e', type: 'FS' }] },
      { id: 'e', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    // Setting a's deps to [b] creates cycle A→B→C→D→E→A
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  it('handles a diamond graph without cycle', async () => {
    //   A
    //  / \
    // B   C
    //  \ /
    //   D
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }, { id: 'c', type: 'FS' }] },
      { id: 'b', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'c', dependencies: [{ id: 'd', type: 'FS' }] },
      { id: 'd', dependencies: [] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'b', type: 'FS' }, { id: 'c', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('replaces old deps of target activity, does not merge', async () => {
    // Existing: A→B→C (A depends on B, B depends on C)
    // Changing A's deps from [B] to [C] yields A→C, B→C — acyclic
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [{ id: 'c', type: 'FS' }] },
      { id: 'c', dependencies: [] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [{ id: 'c', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('detects cycle when replacing deps creates one', async () => {
    // Existing: A→B, C→A (A depends on B, C depends on A)
    // Changing B's deps to [C] creates B→C→A→B cycle
    const prisma = mockPrisma([
      { id: 'a', dependencies: [{ id: 'b', type: 'FS' }] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: [{ id: 'a', type: 'FS' }] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'b',
      [{ id: 'c', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(true);
  });

  it('handles dependencies stored as non-array value gracefully', async () => {
    // Edge case: dependencies field is a string or number (corrupt data)
    const prisma = mockPrisma([
      { id: 'a', dependencies: 'not-an-array' as any },
      { id: 'b', dependencies: 42 as any },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('handles empty dependencies array in existing activities', async () => {
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
      { id: 'c', dependencies: [] },
    ]);
    const result = await detectCircularDependency(
      'project-1',
      'a',
      [],
      prisma,
    );
    expect(result).toBe(false);
  });

  it('correctly handles activityId not present in existing activities', async () => {
    // The activityId being edited might be a newly created activity not yet in DB
    const prisma = mockPrisma([
      { id: 'a', dependencies: [] },
      { id: 'b', dependencies: [] },
    ]);
    // 'new-activity' does not appear in the fetched activities
    // Since color map only has a and b, the DFS only traverses those
    // newDeps for 'new-activity' targeting 'a' won't cause cycle
    // because 'new-activity' is never visited (not in color map)
    const result = await detectCircularDependency(
      'project-1',
      'new-activity',
      [{ id: 'a', type: 'FS' }],
      prisma,
    );
    expect(result).toBe(false);
  });
});
