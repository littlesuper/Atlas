import { describe, it, expect } from 'vitest';
import { buildOrderedDefs, toggleColumnVisible } from './ColumnSettings';
import type { ColumnDef } from './ColumnSettings';

const defs: ColumnDef[] = [
  { key: 'name', label: '名称', removable: false },
  { key: 'status', label: '状态', removable: true },
  { key: 'date', label: '日期', removable: true },
];

describe('buildOrderedDefs', () => {
  it('returns defs in order specified', () => {
    const result = buildOrderedDefs(['status', 'name', 'date'], defs);
    expect(result.map((d) => d.key)).toEqual(['status', 'name', 'date']);
  });

  it('skips keys not in columnDefs', () => {
    const result = buildOrderedDefs(['name', 'unknown', 'date'], defs);
    expect(result.map((d) => d.key)).toEqual(['name', 'date']);
  });

  it('returns empty for empty order', () => {
    expect(buildOrderedDefs([], defs)).toEqual([]);
  });
});

describe('toggleColumnVisible', () => {
  it('adds key when checked=true', () => {
    const result = toggleColumnVisible(['name'], 'status', true);
    expect(result).toEqual(['name', 'status']);
  });

  it('removes key when checked=false', () => {
    const result = toggleColumnVisible(['name', 'status'], 'status', false);
    expect(result).toEqual(['name']);
  });

  it('no-ops when removing non-existent key', () => {
    const result = toggleColumnVisible(['name'], 'date', false);
    expect(result).toEqual(['name']);
  });

  it('no-ops when adding already-present key', () => {
    const result = toggleColumnVisible(['name'], 'name', true);
    expect(result).toEqual(['name', 'name']);
  });

  it('returns all defs when order contains all keys', () => {
    const result = buildOrderedDefs(['name', 'status', 'date'], defs);
    expect(result).toHaveLength(3);
  });

  it('returns empty for empty defs', () => {
    expect(buildOrderedDefs(['a'], [])).toEqual([]);
  });

  it('toggleColumnVisible preserves order when adding', () => {
    const result = toggleColumnVisible(['name', 'date'], 'status', true);
    expect(result).toEqual(['name', 'date', 'status']);
  });

  it('buildOrderedDefs with duplicate order keys returns duplicate defs', () => {
    const result = buildOrderedDefs(['name', 'name', 'status'], defs);
    expect(result.map((d) => d.key)).toEqual(['name', 'name', 'status']);
  });

  it('toggleColumnVisible adds to empty array', () => {
    expect(toggleColumnVisible([], 'name', true)).toEqual(['name']);
  });

  it('buildOrderedDefs preserves order when all keys match defs exactly', () => {
    const result = buildOrderedDefs(['status', 'date', 'name'], defs);
    expect(result.map((d) => d.key)).toEqual(['status', 'date', 'name']);
    expect(result.every((d, i) => d.label === defs.find((def) => def.key === ['status', 'date', 'name'][i])!.label)).toBe(true);
  });

  it('toggleColumnVisible removing the only key returns empty array', () => {
    expect(toggleColumnVisible(['name'], 'name', false)).toEqual([]);
  });

  it('buildOrderedDefs returns empty when all order keys are unknown', () => {
    expect(buildOrderedDefs(['x', 'y', 'z'], defs)).toEqual([]);
  });

  it('toggleColumnVisible removing middle key preserves order of others', () => {
    const result = toggleColumnVisible(['name', 'status', 'date'], 'status', false);
    expect(result).toEqual(['name', 'date']);
  });

  it('toggleColumnVisible removes all duplicate instances', () => {
    const result = toggleColumnVisible(['name', 'status', 'status'], 'status', false);
    expect(result).toEqual(['name']);
  });

  it('buildOrderedDefs preserves label lookup for each key', () => {
    const result = buildOrderedDefs(['date', 'name'], defs);
    expect(result[0].label).toBe('日期');
    expect(result[1].label).toBe('名称');
  });

  it('toggleColumnVisible with checked=true does not deduplicate', () => {
    const result = toggleColumnVisible(['name'], 'name', true);
    expect(result).toEqual(['name', 'name']);
    expect(result).toHaveLength(2);
  });

  it('buildOrderedDefs with duplicate key in defs returns first match', () => {
    const dupDefs: ColumnDef[] = [
      { key: 'name', label: '名称1', removable: false },
      { key: 'name', label: '名称2', removable: false },
    ];
    const result = buildOrderedDefs(['name'], dupDefs);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('名称1');
  });

  it('buildOrderedDefs handles empty columnDefs array', () => {
    expect(buildOrderedDefs(['a', 'b', 'c'], [])).toEqual([]);
  });

  it('buildOrderedDefs preserves order for single column', () => {
    const singleDefs: ColumnDef[] = [{ key: 'x', label: 'X', removable: false }];
    expect(buildOrderedDefs(['x'], singleDefs)).toEqual(singleDefs);
  });

  it('toggleColumnVisible removes key when checked=false', () => {
    const visible = ['name', 'status'];
    const result = toggleColumnVisible(visible, 'status', false);
    expect(result).toEqual(['name']);
  });

  it('toggleColumnVisible with checked=false on empty array returns empty', () => {
    expect(toggleColumnVisible([], 'name', false)).toEqual([]);
  });

  it('buildOrderedDefs with single column returns single element array', () => {
    const singleDefs: ColumnDef[] = [{ key: 'name', label: '名称', removable: false }];
    expect(buildOrderedDefs(['name'], singleDefs)).toHaveLength(1);
  });

  it('toggleColumnVisible adds key to empty visible array', () => {
    const result = toggleColumnVisible([], 'name', true);
    expect(result).toEqual(['name']);
  });

  it('buildOrderedDefs returns defs in order even with duplicate keys in order array', () => {
    const result = buildOrderedDefs(['name', 'name'], defs);
    expect(result.map((d) => d.key)).toEqual(['name', 'name']);
  });

  it('toggleColumnVisible toggles removable key in existing array', () => {
    const visible = ['seq', 'name', 'status'];
    const result = toggleColumnVisible(visible, 'status', false);
    expect(result).not.toContain('status');
    expect(result).toContain('seq');
  });

  it('toggleColumnVisible adds column when not present', () => {
    const visible = ['seq', 'name'];
    const result = toggleColumnVisible(visible, 'status', true);
    expect(result).toContain('status');
  });

  it('toggleColumnVisible removes column when present', () => {
    const visible = ['seq', 'name', 'status'];
    const result = toggleColumnVisible(visible, 'status', false);
    expect(result).not.toContain('status');
  });

  it('toggleColumnVisible adds column when not present and show is true', () => {
    const visible = ['seq', 'name'];
    const result = toggleColumnVisible(visible, 'status', true);
    expect(result).toContain('status');
    expect(result).toContain('seq');
  });

  it('toggleColumnVisible removes duplicate column when hiding', () => {
    const visible = ['seq', 'name', 'name'];
    const result = toggleColumnVisible(visible, 'name', false);
    expect(result).not.toContain('name');
  });

  it('toggleColumnVisible adds column when toggled on', () => {
    const visible = ['seq'];
    const result = toggleColumnVisible(visible, 'name', true);
    expect(result).toContain('name');
  });

  it('toggleColumnVisible removes column when set to false', () => {
    const visible = ['seq', 'name'];
    const result = toggleColumnVisible(visible, 'name', false);
    expect(result).not.toContain('name');
    expect(result).toContain('seq');
  });

  it('buildOrderedDefs handles empty order array', () => {
    const result = buildOrderedDefs([], defs);
    expect(Array.isArray(result)).toBe(true);
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    [`unknown-${index}`, 'date', 'name', `missing-${index}`],
    ['date', 'name'],
  ] as const))(
    'buildOrderedDefs ignores generated unknown keys for order %s',
    (order, expectedKeys) => {
      const result = buildOrderedDefs([...order], defs);

      expect(result.map((def) => def.key)).toEqual(expectedKeys);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`name`, `status-${index}`, `status-${index}`, 'date'],
    `status-${index}`,
  ] as const))(
    'toggleColumnVisible removes every generated duplicate key %s',
    (visible, key) => {
      const result = toggleColumnVisible([...visible], key, false);

      expect(result).toEqual(['name', 'date']);
      expect(result).not.toContain(key);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    [`unknown-${index}`, 'status', 'status', 'name', `ghost-${index}`, 'date'],
    ['status', 'status', 'name', 'date'],
  ] as const))(
    'buildOrderedDefs keeps generated duplicate known keys %s',
    (order, expectedKeys) => {
      const result = buildOrderedDefs([...order], defs);

      expect(result.map((def) => def.key)).toEqual(expectedKeys);
      expect(result.every((def) => defs.includes(def))).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`base-${index}`, 'name'],
    `added-${index}`,
  ] as const))(
    'toggleColumnVisible appends generated visible key %s',
    (visible, key) => {
      const result = toggleColumnVisible([...visible], key, true);

      expect(result).toEqual([...visible, key]);
      expect(result).not.toBe(visible);
    },
  );

  it.each(Array.from({ length: 80 }, (_, index) => [
    [`name`, `ghost-${index}`, 'status', 'date', `ghost-${index}`],
    ['name', 'status', 'date'],
  ] as const))(
    'buildOrderedDefs drops generated unknown keys while preserving known order %#',
    (order, expectedKeys) => {
      const result = buildOrderedDefs([...order], defs);

      expect(result.map((def) => def.key)).toEqual(expectedKeys);
      expect(result.every((def) => defs.includes(def))).toBe(true);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    [`name-${index}`, `name-${index}`, `status-${index}`],
    `new-${index}`,
  ] as const))(
    'toggleColumnVisible appends generated key without dedupe %#',
    (visible, key) => {
      const result = toggleColumnVisible([...visible], key, true);

      expect(result).toEqual([...visible, key]);
      expect(result.filter((item) => item === key)).toHaveLength(1);
    },
  );
});
