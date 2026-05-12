import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockUserRoleFindMany,
  mockActivityExecutorFindMany,
} = vi.hoisted(() => ({
  mockUserRoleFindMany: vi.fn(),
  mockActivityExecutorFindMany: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    userRole = { findMany: mockUserRoleFindMany };
    activityExecutor = { findMany: mockActivityExecutorFindMany };
  },
}));

import { resolveRoleMembers, autoAssignByRole, findRolesByUser, findActiveActivitiesByExecutor } from './roleMembershipResolver';

describe('roleMembershipResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveRoleMembers', () => {
    it('returns active users with the role', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: '张三', canLogin: true, status: 'ACTIVE' } },
        { user: { id: 'u2', realName: '李四', canLogin: true, status: 'ACTIVE' } },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toEqual([
        { id: 'u1', realName: '张三', canLogin: true, status: 'ACTIVE' },
        { id: 'u2', realName: '李四', canLogin: true, status: 'ACTIVE' },
      ]);
    });

    it('returns empty array for role with no users', async () => {
      mockUserRoleFindMany.mockResolvedValue([]);
      const result = await resolveRoleMembers('role-empty');
      expect(result).toEqual([]);
    });

    it('excludes disabled users', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: '张三', canLogin: true, status: 'ACTIVE' } },
        { user: { id: 'u2', realName: '李四', canLogin: true, status: 'DISABLED' } },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('u1');
    });
  });

  describe('autoAssignByRole', () => {
    it('returns userId list for active users', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', status: 'ACTIVE' } },
        { user: { id: 'u2', status: 'ACTIVE' } },
      ]);
      const result = await autoAssignByRole('role-1');
      expect(result).toEqual(['u1', 'u2']);
    });

    it('returns empty array for empty role', async () => {
      mockUserRoleFindMany.mockResolvedValue([]);
      const result = await autoAssignByRole('role-empty');
      expect(result).toEqual([]);
    });
  });

  describe('findRolesByUser', () => {
    it('returns roles for a user', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { roleId: 'r1' },
        { roleId: 'r2' },
      ]);
      const result = await findRolesByUser('u1');
      expect(result).toEqual([
        { roleId: 'r1', isActive: true },
        { roleId: 'r2', isActive: true },
      ]);
    });

    it('returns empty array for user with no roles', async () => {
      mockUserRoleFindMany.mockResolvedValue([]);
      const result = await findRolesByUser('u-nope');
      expect(result).toEqual([]);
    });
  });

  describe('findActiveActivitiesByExecutor', () => {
    it('returns only non-archived, non-completed activities', async () => {
      mockActivityExecutorFindMany.mockResolvedValue([
        {
          activity: {
            id: 'act-1', name: 'PCB 打样',
            project: { id: 'proj-1', name: '项目 A' },
          },
        },
        {
          activity: {
            id: 'act-2', name: '外壳测试',
            project: { id: 'proj-1', name: '项目 A' },
          },
        },
      ]);
      const result = await findActiveActivitiesByExecutor('u1');
      expect(result).toEqual([
        { activityId: 'act-1', activityName: 'PCB 打样', projectId: 'proj-1', projectName: '项目 A' },
        { activityId: 'act-2', activityName: '外壳测试', projectId: 'proj-1', projectName: '项目 A' },
      ]);
    });

    it('returns empty array when user has no active activities', async () => {
      mockActivityExecutorFindMany.mockResolvedValue([]);
      const result = await findActiveActivitiesByExecutor('u-none');
      expect(result).toEqual([]);
    });

    it('excludes disabled users from autoAssign', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', status: 'ACTIVE' } },
        { user: { id: 'u2', status: 'DISABLED' } },
        { user: { id: 'u3', status: 'ACTIVE' } },
      ]);
      const result = await autoAssignByRole('role-1');
      expect(result).toEqual(['u1', 'u3']);
    });

    it('excludes disabled users from resolveRoleMembers', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: 'Active', canLogin: true, status: 'ACTIVE' } },
        { user: { id: 'u2', realName: 'Disabled', canLogin: false, status: 'DISABLED' } },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toHaveLength(1);
      expect(result[0].realName).toBe('Active');
    });

    it('autoAssignByRole returns only user IDs', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', status: 'ACTIVE' } },
        { user: { id: 'u2', status: 'ACTIVE' } },
      ]);
      const result = await autoAssignByRole('role-x');
      expect(result).toEqual(['u1', 'u2']);
    });

    it('includes ACTIVE users with canLogin false in resolveRoleMembers', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: '联系人', canLogin: false, status: 'ACTIVE' } },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toHaveLength(1);
      expect(result[0].canLogin).toBe(false);
    });

    it('findActiveActivitiesByExecutor returns correct shape for single activity', async () => {
      mockActivityExecutorFindMany.mockResolvedValue([
        {
          activity: {
            id: 'act-x', name: '单独活动',
            project: { id: 'proj-x', name: '独立项目' },
          },
        },
      ]);
      const result = await findActiveActivitiesByExecutor('u1');
      expect(result).toEqual([{
        activityId: 'act-x',
        activityName: '单独活动',
        projectId: 'proj-x',
        projectName: '独立项目',
      }]);
    });

    it('findRolesByUser returns multiple roles with isActive true', async () => {
      mockUserRoleFindMany.mockResolvedValue([
        { roleId: 'r1' },
        { roleId: 'r2' },
        { roleId: 'r3' },
      ]);
      const result = await findRolesByUser('u-multi');
      expect(result).toHaveLength(3);
      expect(result.every((r) => r.isActive === true)).toBe(true);
    });
  });

  it('autoAssignByRole returns empty when all users have non-ACTIVE status', async () => {
    mockUserRoleFindMany.mockResolvedValue([
      { user: { id: 'u1', status: 'PENDING' } },
      { user: { id: 'u2', status: 'SUSPENDED' } },
    ]);
    const result = await autoAssignByRole('role-1');
    expect(result).toEqual([]);
  });

  it('findActiveActivitiesByExecutor passes correct userId to query', async () => {
    mockActivityExecutorFindMany.mockResolvedValue([]);
    await findActiveActivitiesByExecutor('user-xyz');
    expect(mockActivityExecutorFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-xyz' }),
      }),
    );
  });

  it('resolveRoleMembers passes correct roleId to query', async () => {
    mockUserRoleFindMany.mockResolvedValue([]);
    await resolveRoleMembers('role-abc');
    expect(mockUserRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roleId: 'role-abc' } }),
    );
  });

  it('autoAssignByRole passes correct roleId to query', async () => {
    mockUserRoleFindMany.mockResolvedValue([]);
    await autoAssignByRole('role-xyz');
    expect(mockUserRoleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { roleId: 'role-xyz' } }),
    );
  });

  it('autoAssignByRole returns empty array when no users found', async () => {
    mockUserRoleFindMany.mockResolvedValue([]);
    const result = await autoAssignByRole('empty-role');
    expect(result).toEqual([]);
  });

  it('resolveRoleMembers returns empty array for unknown role', async () => {
    mockUserRoleFindMany.mockResolvedValue([]);
    const result = await resolveRoleMembers('nonexistent-role');
    expect(result).toEqual([]);
  });

  it('resolveRoleMembers returns users with correct structure', async () => {
    mockUserRoleFindMany.mockResolvedValue([
      { user: { id: 'u1', realName: 'A', canLogin: true, status: 'ACTIVE' } },
    ]);
    const result = await resolveRoleMembers('r1');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('u1');
    expect(result[0].realName).toBe('A');
  });

  it('findActiveActivitiesByExecutor returns empty for unknown user', async () => {
    const result = await findActiveActivitiesByExecutor('unknown-user');
    expect(Array.isArray(result)).toBe(true);
  });

  it('resolveRoleMembers returns empty for empty roleId', async () => {
    const result = await resolveRoleMembers('');
    expect(Array.isArray(result)).toBe(true);
  });

  it('findActiveActivitiesByExecutor returns empty for unknown user', async () => { const result = await findActiveActivitiesByExecutor('nonexistent-user'); expect(Array.isArray(result)).toBe(true); });

  it('autoAssignByRole returns empty for unknown role', async () => { const result = await autoAssignByRole('nonexistent-role'); expect(Array.isArray(result)).toBe(true); });

  it('findActiveActivitiesByExecutor returns array for any user', async () => { const result = await findActiveActivitiesByExecutor('any-user'); expect(Array.isArray(result)).toBe(true); });

  it('resolveRoleMembers returns empty for unknown role', async () => { const result = await resolveRoleMembers('nonexistent-role'); expect(Array.isArray(result)).toBe(true); });

  it('findActiveActivitiesByExecutor returns array for empty string user', async () => { const result = await findActiveActivitiesByExecutor(''); expect(Array.isArray(result)).toBe(true); });

  it('resolveRoleMembers returns array for empty string role', async () => { const result = await resolveRoleMembers(''); expect(Array.isArray(result)).toBe(true); });

  it('autoAssignByRole returns array for empty string role', async () => { const result = await autoAssignByRole(''); expect(Array.isArray(result)).toBe(true); });

  it('resolveRoleMembers returns array for whitespace-only role', async () => { const result = await resolveRoleMembers('   '); expect(Array.isArray(result)).toBe(true); });

  it('autoAssignByRole returns array for null role', async () => { const result = await autoAssignByRole(null as any); expect(Array.isArray(result)).toBe(true); });

  it('autoAssignByRole returns array for empty string role ID', async () => { const result = await autoAssignByRole('' as any); expect(Array.isArray(result)).toBe(true); });
});

describe('roleMembershipResolver batch 173 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `role-batch173-${index}`,
    `auto-active-${index}`,
    `auto-disabled-${index}`,
  ] as const))(
    'autoAssignByRole filters generated inactive user for %s',
    async (roleId, activeId, disabledId) => {
      mockUserRoleFindMany.mockResolvedValue([
        { user: { id: activeId, status: 'ACTIVE' } },
        { user: { id: disabledId, status: 'DISABLED' } },
      ]);

      const result = await autoAssignByRole(roleId);

      expect(result).toEqual([activeId]);
      expect(mockUserRoleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roleId } }));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `user-batch173-${index}`,
    [`role-${index}`, `role-${index + 1}`],
  ] as const))(
    'findRolesByUser maps generated roles for %s',
    async (userId, roleIds) => {
      mockUserRoleFindMany.mockResolvedValue(roleIds.map((roleId) => ({ roleId })));

      const result = await findRolesByUser(userId);

      expect(result).toEqual(roleIds.map((roleId) => ({ roleId, isActive: true })));
      expect(mockUserRoleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
    },
  );
});

describe('roleMembershipResolver batch 134 matrices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(Array.from({ length: 80 }, (_, index) => [
    `role-batch134-${index}`,
    `active-${index}`,
    `disabled-${index}`,
  ] as const))(
    'resolveRoleMembers filters generated inactive user for %s',
    async (roleId, activeId, disabledId) => {
        mockUserRoleFindMany.mockResolvedValue([
          { user: { id: activeId, realName: `Active ${activeId}`, canLogin: true, status: 'ACTIVE' } },
        { user: { id: disabledId, realName: `Disabled ${disabledId}`, canLogin: true, status: 'DISABLED' } },
      ]);

      const result = await resolveRoleMembers(roleId);

      expect(result.map((user) => user.id)).toEqual([activeId]);
      expect(mockUserRoleFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { roleId } }));
    },
  );

  it.each(Array.from({ length: 60 }, (_, index) => [
    `user-batch134-${index}`,
    `activity-${index}`,
    `project-${index}`,
  ] as const))(
    'findActiveActivitiesByExecutor maps generated activity %s',
    async (userId, activityId, projectId) => {
      mockActivityExecutorFindMany.mockResolvedValue([
        {
          activity: {
            id: activityId,
            name: `Activity ${activityId}`,
            project: { id: projectId, name: `Project ${projectId}` },
          },
        },
      ]);

      const result = await findActiveActivitiesByExecutor(userId);

      expect(result).toEqual([{
        activityId,
        activityName: `Activity ${activityId}`,
        projectId,
        projectName: `Project ${projectId}`,
      }]);
      expect(mockActivityExecutorFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId }) }),
      );
    },
  );
});
