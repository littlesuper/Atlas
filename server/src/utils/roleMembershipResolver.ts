import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function resolveRoleMembers(roleId: string) {
  const userRoles = await prisma.userRole.findMany({
    where: { roleId },
    include: { user: { select: { id: true, realName: true, canLogin: true, status: true } } },
  });
  return userRoles.filter(ur => ur.user.status === 'ACTIVE').map((ur) => ur.user);
}

export async function autoAssignByRole(roleId: string): Promise<string[]> {
  const userRoles = await prisma.userRole.findMany({
    where: { roleId },
    include: { user: { select: { id: true, status: true } } },
  });
  return userRoles.filter(ur => ur.user.status === 'ACTIVE').map((ur) => ur.user.id);
}

export async function findRolesByUser(
  userId: string,
) {
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  return userRoles.map((r) => ({ roleId: r.roleId, isActive: true }));
}

export async function findActiveActivitiesByExecutor(userId: string) {
  const results = await prisma.activityExecutor.findMany({
    where: {
      userId,
      activity: {
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        project: { status: { not: 'ARCHIVED' } },
      },
    },
    include: {
      activity: {
        select: {
          id: true,
          name: true,
          projectId: true,
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  return results.map((r) => ({
    activityId: r.activity.id,
    activityName: r.activity.name,
    projectId: r.activity.project.id,
    projectName: r.activity.project.name,
  }));
}

export { prisma };
