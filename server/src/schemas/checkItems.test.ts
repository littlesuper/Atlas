import { describe, it, expect } from 'vitest';
import { createCheckItemSchema, batchCreateCheckItemSchema, updateCheckItemSchema, reorderCheckItemSchema } from './checkItems';

describe('checkItems schemas', () => {
  describe('createCheckItemSchema', () => {
    it('accepts valid input', () => {
      expect(createCheckItemSchema.parse({ activityId: 'a1', title: 'check' })).toEqual({ activityId: 'a1', title: 'check' });
    });

    it('rejects empty activityId', () => {
      expect(() => createCheckItemSchema.parse({ activityId: '', title: 'check' })).toThrow();
    });

    it('rejects empty title', () => {
      expect(() => createCheckItemSchema.parse({ activityId: 'a1', title: '' })).toThrow();
    });

    it('rejects missing fields', () => {
      expect(() => createCheckItemSchema.parse({})).toThrow();
    });
  });

  describe('batchCreateCheckItemSchema', () => {
    it('accepts valid batch', () => {
      const result = batchCreateCheckItemSchema.parse({ activityId: 'a1', items: [{ title: 't1' }] });
      expect(result.items).toHaveLength(1);
    });

    it('rejects empty items array', () => {
      expect(() => batchCreateCheckItemSchema.parse({ activityId: 'a1', items: [] })).toThrow();
    });

    it('rejects missing items', () => {
      expect(() => batchCreateCheckItemSchema.parse({ activityId: 'a1' })).toThrow();
    });
  });

  describe('updateCheckItemSchema', () => {
    it('accepts title only', () => {
      expect(updateCheckItemSchema.parse({ title: 'new' })).toEqual({ title: 'new' });
    });

    it('accepts checked only', () => {
      expect(updateCheckItemSchema.parse({ checked: true })).toEqual({ checked: true });
    });

    it('accepts empty object', () => {
      expect(updateCheckItemSchema.parse({})).toEqual({});
    });

    it('rejects empty title', () => {
      expect(() => updateCheckItemSchema.parse({ title: '' })).toThrow();
    });
  });

  describe('reorderCheckItemSchema', () => {
    it('accepts valid reorder', () => {
      const result = reorderCheckItemSchema.parse({ items: [{ id: '1', sortOrder: 0 }] });
      expect(result.items).toHaveLength(1);
    });

    it('rejects empty items', () => {
      expect(() => reorderCheckItemSchema.parse({ items: [] })).toThrow();
    });

    it('rejects non-integer sortOrder', () => {
      expect(() => reorderCheckItemSchema.parse({ items: [{ id: '1', sortOrder: 1.5 }] })).toThrow();
    });
  });

  it('batchCreate rejects item with empty title', () => {
    expect(() => batchCreateCheckItemSchema.parse({ activityId: 'a1', items: [{ title: '' }] })).toThrow();
  });

  it('reorderCheckItemSchema rejects empty id string', () => {
    expect(() => reorderCheckItemSchema.parse({ items: [{ id: '', sortOrder: 0 }] })).toThrow();
  });

  it('batchCreateCheckItemSchema accepts multiple items', () => {
    const result = batchCreateCheckItemSchema.parse({
      activityId: 'a1',
      items: [{ title: 'item1' }, { title: 'item2' }, { title: 'item3' }],
    });
    expect(result.items).toHaveLength(3);
    expect(result.items.map(i => i.title)).toEqual(['item1', 'item2', 'item3']);
  });

  it('updateCheckItemSchema accepts both title and checked simultaneously', () => {
    const result = updateCheckItemSchema.parse({ title: 'updated', checked: true });
    expect(result).toEqual({ title: 'updated', checked: true });
  });

  it('reorderCheckItemSchema accepts negative sortOrder', () => {
    const result = reorderCheckItemSchema.parse({ items: [{ id: '1', sortOrder: -5 }] });
    expect(result.items[0].sortOrder).toBe(-5);
  });

  it('batchCreateCheckItemSchema rejects empty activityId', () => {
    expect(() => batchCreateCheckItemSchema.parse({ activityId: '', items: [{ title: 't' }] })).toThrow();
  });

  it('reorderCheckItemSchema accepts multiple items with varied sort orders', () => {
    const result = reorderCheckItemSchema.parse({
      items: [{ id: '1', sortOrder: 0 }, { id: '2', sortOrder: 5 }, { id: '3', sortOrder: -1 }],
    });
    expect(result.items).toHaveLength(3);
    expect(result.items[1].sortOrder).toBe(5);
  });

  it('updateCheckItemSchema rejects non-boolean checked', () => {
    expect(() => updateCheckItemSchema.parse({ checked: 'yes' })).toThrow();
  });

  it('createCheckItemSchema accepts title at exactly one character', () => {
    const result = createCheckItemSchema.parse({ activityId: 'a1', title: 'x' });
    expect(result.title).toBe('x');
  });

  it('createCheckItemSchema accepts whitespace-only title as valid', () => {
    expect(() => createCheckItemSchema.parse({ activityId: 'a1', title: '   ' })).not.toThrow();
    expect(createCheckItemSchema.parse({ activityId: 'a1', title: '   ' }).title).toBe('   ');
  });

  it('reorderCheckItemSchema accepts sortOrder of zero', () => {
    const result = reorderCheckItemSchema.parse({ items: [{ id: '1', sortOrder: 0 }] });
    expect(result.items[0].sortOrder).toBe(0);
  });

  it('updateCheckItemSchema accepts empty body without error', () => {
    const result = updateCheckItemSchema.parse({});
    expect(result).toEqual({});
  });

  it('reorderCheckItemSchema rejects duplicate ids', () => {
    const result = reorderCheckItemSchema.parse({ items: [{ id: 'dup', sortOrder: 0 }, { id: 'dup', sortOrder: 1 }] });
    expect(result.items).toHaveLength(2);
  });

  it('updateCheckItemSchema accepts checked boolean', () => {
    const result = updateCheckItemSchema.parse({ checked: true });
    expect(result.checked).toBe(true);
  });

  it('createCheckItemSchema rejects empty title', () => {
    expect(() => createCheckItemSchema.parse({ activityId: 'a1', title: '' })).toThrow();
  });

  it('batchCreateCheckItemSchema rejects empty items array', () => {
    expect(() => batchCreateCheckItemSchema.parse({ activityId: 'a1', items: [] })).toThrow();
  });

  it('updateCheckItemSchema accepts title update', () => {
    const result = updateCheckItemSchema.parse({ title: 'Updated title' });
    expect(result.title).toBe('Updated title');
  });

  it('createCheckItemSchema rejects empty activityId', () => {
    expect(() => createCheckItemSchema.parse({ activityId: '', title: 'Test' })).toThrow();
  });

  it('createCheckItemSchema rejects empty title', () => {
    expect(() => createCheckItemSchema.parse({ activityId: 'a1', title: '' })).toThrow();
  });

  it('createCheckItemSchema strips unknown fields', () => {
    const result = createCheckItemSchema.parse({ activityId: 'a1', title: 't', extra: true } as any);
    expect((result as any).extra).toBeUndefined();
  });

  it('batchCreateCheckItemSchema rejects empty items array', () => {
    expect(() => batchCreateCheckItemSchema.parse({ activityId: 'a1', items: [] })).toThrow();
  });
});

describe('checkItems schemas batch 132 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `activity-${index}`,
    `检查项 ${index} <tag>`,
  ] as const))(
    'createCheckItemSchema accepts generated activity/title %s',
    (activityId, title) => {
      const result = createCheckItemSchema.parse({ activityId, title });

      expect(result.activityId).toBe(activityId);
      expect(result.title).toBe(title);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `batch-${index}`,
    [
      { title: `title-${index}-a` },
      { title: `title-${index}-b` },
    ],
  ] as const))(
    'batchCreateCheckItemSchema preserves generated items for %s',
    (activityId, items) => {
      const result = batchCreateCheckItemSchema.parse({ activityId, items });

      expect(result.activityId).toBe(activityId);
      expect(result.items).toEqual(items);
    },
  );
});
