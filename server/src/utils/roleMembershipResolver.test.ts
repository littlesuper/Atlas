import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockRoleMemberFindMany,
  mockActivityExecutorFindMany,
} = vi.hoisted(() => ({
  mockRoleMemberFindMany: vi.fn(),
  mockActivityExecutorFindMany: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    roleMember = { findMany: mockRoleMemberFindMany };
    activityExecutor = { findMany: mockActivityExecutorFindMany };
  },
}));

import { resolveRoleMembers, autoAssignByRole, findRolesByUser, findActiveActivitiesByExecutor } from './roleMembershipResolver';

describe('roleMembershipResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveRoleMembers', () => {
    it('returns active members sorted by sortOrder', async () => {
      mockRoleMemberFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: '张三', canLogin: true }, sortOrder: 0 },
        { user: { id: 'u2', realName: '李四', canLogin: true }, sortOrder: 1 },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toEqual([
        { id: 'u1', realName: '张三', canLogin: true },
        { id: 'u2', realName: '李四', canLogin: true },
      ]);
      expect(mockRoleMemberFindMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1', isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        include: { user: { select: { id: true, realName: true, canLogin: true } } },
      });
    });

    it('returns empty array for role with no members', async () => {
      mockRoleMemberFindMany.mockResolvedValue([]);
      const result = await resolveRoleMembers('role-empty');
      expect(result).toEqual([]);
    });

    it('excludes soft-deleted members (isActive=false)', async () => {
      mockRoleMemberFindMany.mockResolvedValue([
        { user: { id: 'u1', realName: '张三', canLogin: true }, sortOrder: 0 },
      ]);
      const result = await resolveRoleMembers('role-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('autoAssignByRole', () => {
    it('returns userId list for active members', async () => {
      mockRoleMemberFindMany.mockResolvedValue([
        { userId: 'u1' },
        { userId: 'u2' },
      ]);
      const result = await autoAssignByRole('role-1');
      expect(result).toEqual(['u1', 'u2']);
    });

    it('returns empty array for empty role', async () => {
      mockRoleMemberFindMany.mockResolvedValue([]);
      const result = await autoAssignByRole('role-empty');
      expect(result).toEqual([]);
    });
  });

  describe('findRolesByUser', () => {
    it('returns active roles for a user by default', async () => {
      mockRoleMemberFindMany.mockResolvedValue([
        { roleId: 'r1', isActive: true },
        { roleId: 'r2', isActive: true },
      ]);
      const result = await findRolesByUser('u1');
      expect(result).toEqual([
        { roleId: 'r1', isActive: true },
        { roleId: 'r2', isActive: true },
      ]);
      expect(mockRoleMemberFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1', isActive: true },
        })
      );
    });

    it('includes inactive roles when includeInactive=true', async () => {
      mockRoleMemberFindMany.mockResolvedValue([
        { roleId: 'r1', isActive: true },
        { roleId: 'r2', isActive: false },
      ]);
      const result = await findRolesByUser('u1', { includeInactive: true });
      expect(result).toEqual([
        { roleId: 'r1', isActive: true },
        { roleId: 'r2', isActive: false },
      ]);
      expect(mockRoleMemberFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'u1' },
        })
      );
    });

    it('returns empty array for user with no roles', async () => {
      mockRoleMemberFindMany.mockResolvedValue([]);
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
      expect(mockActivityExecutorFindMany).toHaveBeenCalledWith({
        where: {
          userId: 'u1',
          activity: {
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
            project: { status: { not: 'ARCHIVED' } },
          },
        },
        include: {
          activity: {
            select: {
              id: true, name: true, projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    it('returns empty array when user has no active activities', async () => {
      mockActivityExecutorFindMany.mockResolvedValue([]);
      const result = await findActiveActivitiesByExecutor('u-none');
      expect(result).toEqual([]);
    });
  });
});
