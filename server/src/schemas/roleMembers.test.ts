import { describe, it, expect } from 'vitest';
import { createRoleMemberSchema, updateRoleMemberSchema, batchSetSchema, deleteRoleMemberSchema } from './roleMembers';

describe('roleMembers schemas', () => {
  describe('createRoleMemberSchema', () => {
    it('accepts valid input', () => {
      const result = createRoleMemberSchema.parse({ roleId: 'r1', userId: 'u1' });
      expect(result).toEqual({ roleId: 'r1', userId: 'u1', sortOrder: 0 });
    });

    it('defaults sortOrder to 0', () => {
      expect(createRoleMemberSchema.parse({ roleId: 'r1', userId: 'u1' }).sortOrder).toBe(0);
    });

    it('accepts custom sortOrder', () => {
      expect(createRoleMemberSchema.parse({ roleId: 'r1', userId: 'u1', sortOrder: 5 }).sortOrder).toBe(5);
    });

    it('rejects empty roleId', () => {
      expect(() => createRoleMemberSchema.parse({ roleId: '', userId: 'u1' })).toThrow();
    });

    it('rejects empty userId', () => {
      expect(() => createRoleMemberSchema.parse({ roleId: 'r1', userId: '' })).toThrow();
    });
  });

  describe('updateRoleMemberSchema', () => {
    it('accepts sortOrder only', () => {
      expect(updateRoleMemberSchema.parse({ sortOrder: 3 })).toEqual({ sortOrder: 3 });
    });

    it('accepts isActive only', () => {
      expect(updateRoleMemberSchema.parse({ isActive: false })).toEqual({ isActive: false });
    });

    it('accepts empty object', () => {
      expect(updateRoleMemberSchema.parse({})).toEqual({});
    });
  });

  describe('batchSetSchema', () => {
    it('accepts valid batch', () => {
      const result = batchSetSchema.parse({ roleId: 'r1', members: [{ userId: 'u1' }] });
      expect(result.members).toHaveLength(1);
    });

    it('accepts empty members array', () => {
      const result = batchSetSchema.parse({ roleId: 'r1', members: [] });
      expect(result.members).toHaveLength(0);
    });

    it('defaults member sortOrder to 0', () => {
      const result = batchSetSchema.parse({ roleId: 'r1', members: [{ userId: 'u1' }] });
      expect(result.members[0].sortOrder).toBe(0);
    });

    it('rejects empty roleId', () => {
      expect(() => batchSetSchema.parse({ roleId: '', members: [] })).toThrow();
    });
  });

  describe('deleteRoleMemberSchema', () => {
    it('defaults cascadeMode to keep', () => {
      const result = deleteRoleMemberSchema.parse({});
      expect(result.cascadeMode).toBe('keep');
    });

    it('accepts cascadeMode options', () => {
      for (const mode of ['keep', 'removeAll', 'selective'] as const) {
        expect(deleteRoleMemberSchema.parse({ cascadeMode: mode }).cascadeMode).toBe(mode);
      }
    });

    it('accepts cascadeActivityIds', () => {
      const result = deleteRoleMemberSchema.parse({ cascadeMode: 'selective', cascadeActivityIds: ['a1', 'a2'] });
      expect(result.cascadeActivityIds).toEqual(['a1', 'a2']);
    });

    it('rejects invalid cascadeMode', () => {
      expect(() => deleteRoleMemberSchema.parse({ cascadeMode: 'invalid' })).toThrow();
    });
  });

  it('batchSetSchema rejects member with empty userId', () => {
    expect(() => batchSetSchema.parse({ roleId: 'r1', members: [{ userId: '' }] })).toThrow();
  });

  it('createRoleMemberSchema rejects non-integer sortOrder', () => {
    expect(() => createRoleMemberSchema.parse({ roleId: 'r1', userId: 'u1', sortOrder: 1.5 })).toThrow();
  });

  it('updateRoleMemberSchema rejects non-integer sortOrder', () => {
    expect(() => updateRoleMemberSchema.parse({ sortOrder: 1.5 })).toThrow();
  });

  it('updateRoleMemberSchema accepts both sortOrder and isActive simultaneously', () => {
    const result = updateRoleMemberSchema.parse({ sortOrder: 10, isActive: true });
    expect(result).toEqual({ sortOrder: 10, isActive: true });
  });

  it('deleteRoleMemberSchema omits cascadeActivityIds when not provided', () => {
    const result = deleteRoleMemberSchema.parse({ cascadeMode: 'removeAll' });
    expect(result.cascadeMode).toBe('removeAll');
    expect(result.cascadeActivityIds).toBeUndefined();
  });

  it('batchSetSchema accepts members with custom sortOrder values', () => {
    const result = batchSetSchema.parse({
      roleId: 'r1',
      members: [{ userId: 'u1', sortOrder: 10 }, { userId: 'u2', sortOrder: 20 }],
    });
    expect(result.members[0].sortOrder).toBe(10);
    expect(result.members[1].sortOrder).toBe(20);
  });

  it('deleteRoleMemberSchema accepts cascadeActivityIds as empty array', () => {
    const result = deleteRoleMemberSchema.parse({ cascadeMode: 'selective', cascadeActivityIds: [] });
    expect(result.cascadeActivityIds).toEqual([]);
  });

  it('createRoleMemberSchema rejects empty userId', () => {
    expect(() => createRoleMemberSchema.parse({ roleId: 'r1', userId: '' })).toThrow();
  });

  it('createRoleMemberSchema accepts negative sortOrder', () => {
    const result = createRoleMemberSchema.parse({ roleId: 'r1', userId: 'u1', sortOrder: -1 });
    expect(result.sortOrder).toBe(-1);
  });

  it('deleteRoleMemberSchema defaults cascadeMode to keep', () => {
    const result = deleteRoleMemberSchema.parse({});
    expect(result.cascadeMode).toBe('keep');
  });

  it('batchSetSchema accepts roleId with maximum length members array', () => {
    const members = Array.from({ length: 50 }, (_, i) => ({ userId: `u${i}`, sortOrder: i }));
    const result = batchSetSchema.parse({ roleId: 'r1', members });
    expect(result.members).toHaveLength(50);
  });

  it('updateRoleMemberSchema accepts isActive false', () => {
    const result = updateRoleMemberSchema.parse({ isActive: false });
    expect(result.isActive).toBe(false);
  });

  it('batchSetSchema rejects member with empty userId', () => {
    expect(() => batchSetSchema.parse({ roleId: 'r1', members: [{ userId: '' }] })).toThrow();
  });

  it('createRoleMemberSchema rejects missing roleId field', () => {
    expect(() => createRoleMemberSchema.parse({ userId: 'u1' } as any)).toThrow();
  });

  it('deleteRoleMemberSchema defaults cascadeMode to keep with no input', () => {
    const result = deleteRoleMemberSchema.parse({});
    expect(result.cascadeMode).toBe('keep');
    expect(result.cascadeActivityIds).toBeUndefined();
  });

  it('deleteRoleMemberSchema accepts cascadeActivityIds as empty array', () => {
    const result = deleteRoleMemberSchema.parse({ cascadeActivityIds: [] });
    expect(result.cascadeActivityIds).toEqual([]);
  });
});

describe('roleMembers schemas batch 126 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    `role-${index}`,
    `user-${index}`,
    index - 20,
  ] as const))(
    'createRoleMemberSchema accepts generated sortOrder %s/%s/%s',
    (roleId, userId, sortOrder) => {
      expect(createRoleMemberSchema.parse({ roleId, userId, sortOrder })).toEqual({
        roleId,
        userId,
        sortOrder,
      });
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `role-batch-${index}`,
    Array.from({ length: (index % 5) + 1 }, (_, memberIndex) => ({
      userId: `user-${index}-${memberIndex}`,
      sortOrder: memberIndex - index,
    })),
  ] as const))(
    'batchSetSchema preserves generated members for %s',
    (roleId, members) => {
      const result = batchSetSchema.parse({ roleId, members });

      expect(result.roleId).toBe(roleId);
      expect(result.members).toEqual(members);
    },
  );
});

describe('roleMembers schemas batch 133 matrices', () => {
  it.each(Array.from({ length: 80 }, (_, index) => [
    index - 40,
    index % 2 === 0,
  ] as const))(
    'updateRoleMemberSchema accepts generated sortOrder/isActive %s/%s',
    (sortOrder, isActive) => {
      const result = updateRoleMemberSchema.parse({ sortOrder, isActive });

      expect(result.sortOrder).toBe(sortOrder);
      expect(result.isActive).toBe(isActive);
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    ['keep', 'removeAll', 'selective'][index % 3],
    Array.from({ length: index % 4 }, (_, activityIndex) => `activity-${index}-${activityIndex}`),
  ] as const))(
    'deleteRoleMemberSchema accepts generated cascade mode %s',
    (cascadeMode, cascadeActivityIds) => {
      const result = deleteRoleMemberSchema.parse({ cascadeMode, cascadeActivityIds });

      expect(result.cascadeMode).toBe(cascadeMode);
      expect(result.cascadeActivityIds).toEqual(cascadeActivityIds);
    },
  );
});
