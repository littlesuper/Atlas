import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function resolveRoleMembers(roleId: string) {
  const members = await prisma.roleMember.findMany({
    where: { roleId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    include: { user: { select: { id: true, realName: true, canLogin: true } } },
  });
  return members.map((m) => m.user);
}

export async function autoAssignByRole(roleId: string): Promise<string[]> {
  const members = await prisma.roleMember.findMany({
    where: { roleId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

export async function findRolesByUser(
  userId: string,
  options?: { includeInactive?: boolean }
) {
  const where: any = { userId };
  if (!options?.includeInactive) where.isActive = true;

  const records = await prisma.roleMember.findMany({
    where,
    select: { roleId: true, isActive: true },
  });
  return records.map((r) => ({ roleId: r.roleId, isActive: r.isActive }));
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
