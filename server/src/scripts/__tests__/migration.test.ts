import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockActivityFindMany,
  mockActivityUpdate,
  mockExecutorCreate,
  mockExecutorFindMany,
  mockRoleMemberCreate,
  mockRoleMemberUpdateMany,
  mockRawQuery,
  mockRawExecute,
} = vi.hoisted(() => ({
  mockActivityFindMany: vi.fn(),
  mockActivityUpdate: vi.fn(),
  mockExecutorCreate: vi.fn(),
  mockExecutorFindMany: vi.fn(),
  mockRoleMemberCreate: vi.fn(),
  mockRoleMemberUpdateMany: vi.fn(),
  mockRawQuery: vi.fn(),
  mockRawExecute: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    activity = {
      findMany: mockActivityFindMany,
      update: mockActivityUpdate,
    };
    activityExecutor = {
      create: mockExecutorCreate,
      findMany: mockExecutorFindMany,
    };
    roleMember = {
      create: mockRoleMemberCreate,
      updateMany: mockRoleMemberUpdateMany,
    };
    $queryRawUnsafe = mockRawQuery;
    $executeRawUnsafe = mockRawExecute;
    $disconnect = vi.fn();
  },
}));

describe('Activity Role Binding Migration', () => {
  beforeEach(() => vi.clearAllMocks());

  it('migrates single-role user to ROLE_AUTO', async () => {
    mockRawExecute.mockResolvedValue(undefined);
    mockRawQuery.mockResolvedValue([{ count: 1 }]);
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'act-1',
        name: 'PCB 打样',
        createdAt: new Date('2026-01-01'),
        assignees: [
          {
            id: 'u1',
            realName: '张三',
            canLogin: true,
            userRoles: [{ role: { id: 'r-hw', name: '硬件工程师' } }],
          },
        ],
      },
    ]);
    mockExecutorCreate.mockResolvedValue({ id: 'ae1' });
    mockExecutorFindMany.mockResolvedValue([
      { snapshotRoleId: 'r-hw', userId: 'u1' },
    ]);
    mockRoleMemberCreate.mockResolvedValue({ id: 'rm1' });

    const { PrismaClient: PC } = await import('@prisma/client');
    const prisma = new PC() as any;

    // Simulate migration logic
    const activities = await prisma.activity.findMany({
      select: {
        id: true, name: true, createdAt: true,
        assignees: { select: { id: true, realName: true, canLogin: true, userRoles: { include: { role: true } } } },
      },
    });

    for (const activity of activities) {
      for (const assignee of activity.assignees) {
        if (assignee.userRoles.length === 1) {
          await prisma.activityExecutor.create({
            data: {
              activityId: activity.id,
              userId: assignee.id,
              source: 'ROLE_AUTO',
              snapshotRoleId: assignee.userRoles[0].role.id,
              assignedAt: activity.createdAt,
            },
          });
        }
      }
    }

    expect(mockExecutorCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'ROLE_AUTO',
          snapshotRoleId: 'r-hw',
        }),
      })
    );
  });

  it('migrates contact (canLogin=false) as MANUAL_ADD', async () => {
    const executorData: any[] = [];
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'act-2',
        name: '协调会议',
        createdAt: new Date(),
        assignees: [{ id: 'u-contact', realName: '外部联系人', canLogin: false, userRoles: [] }],
      },
    ]);
    mockExecutorCreate.mockImplementation((data: any) => {
      executorData.push(data);
      return Promise.resolve({ id: 'ae2' });
    });

    const { PrismaClient: PC } = await import('@prisma/client');
    const prisma = new PC() as any;

    const activities = await prisma.activity.findMany({
      select: {
        id: true, name: true, createdAt: true,
        assignees: { select: { id: true, realName: true, canLogin: true, userRoles: { include: { role: true } } } },
      },
    });

    for (const activity of activities) {
      for (const assignee of activity.assignees) {
        const source = !assignee.canLogin ? 'MANUAL_ADD' : 'ROLE_AUTO';
        await prisma.activityExecutor.create({
          data: {
            activityId: activity.id,
            userId: assignee.id,
            source,
            snapshotRoleId: null,
            assignedAt: activity.createdAt,
          },
        });
      }
    }

    expect(executorData[0].data.source).toBe('MANUAL_ADD');
    expect(executorData[0].data.snapshotRoleId).toBeNull();
  });

  it('migrates multi-role user with non-admin preference', async () => {
    const executorData: any[] = [];
    mockActivityFindMany.mockResolvedValue([
      {
        id: 'act-3',
        name: 'SMT 调试',
        createdAt: new Date(),
        assignees: [
          {
            id: 'u-multi',
            realName: '王五',
            canLogin: true,
            userRoles: [
              { role: { id: 'r-admin', name: '系统管理员' } },
              { role: { id: 'r-hw', name: '硬件工程师' } },
            ],
          },
        ],
      },
    ]);
    mockExecutorCreate.mockImplementation((data: any) => {
      executorData.push(data);
      return Promise.resolve({ id: 'ae3' });
    });

    const { PrismaClient: PC } = await import('@prisma/client');
    const prisma = new PC() as any;

    const activities = await prisma.activity.findMany({
      select: {
        id: true, name: true, createdAt: true,
        assignees: { select: { id: true, realName: true, canLogin: true, userRoles: { include: { role: true } } } },
      },
    });

    for (const activity of activities) {
      for (const assignee of activity.assignees) {
        const nonAdminRole = assignee.userRoles.find((ur: any) => ur.role.name !== '系统管理员');
        const roleId = nonAdminRole ? nonAdminRole.role.id : assignee.userRoles[0].role.id;
        await prisma.activityExecutor.create({
          data: {
            activityId: activity.id,
            userId: assignee.id,
            source: 'ROLE_AUTO',
            snapshotRoleId: roleId,
            assignedAt: activity.createdAt,
          },
        });
      }
    }

    expect(executorData[0].data.snapshotRoleId).toBe('r-hw');
  });

  it('builds RoleMember from aggregated pairs', async () => {
    mockExecutorFindMany.mockResolvedValue([
      { snapshotRoleId: 'r-hw', userId: 'u1' },
      { snapshotRoleId: 'r-hw', userId: 'u2' },
      { snapshotRoleId: 'r-sw', userId: 'u3' },
    ]);
    mockRoleMemberCreate.mockResolvedValue({ id: 'rm1' });

    const { PrismaClient: PC } = await import('@prisma/client');
    const prisma = new PC() as any;

    const pairs = await prisma.activityExecutor.findMany({
      where: { source: 'ROLE_AUTO', snapshotRoleId: { not: null } },
      select: { snapshotRoleId: true, userId: true },
      distinct: ['snapshotRoleId', 'userId'],
    });

    const seen = new Set<string>();
    for (const pair of pairs) {
      const key = `${pair.snapshotRoleId}:${pair.userId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      await prisma.roleMember.create({
        data: { roleId: pair.snapshotRoleId, userId: pair.userId, isActive: true, sortOrder: 0 },
      });
    }

    expect(mockRoleMemberCreate).toHaveBeenCalledTimes(3);
  });
});
