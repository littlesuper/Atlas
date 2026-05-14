import { NextFunction, Request, Response } from 'express';
import { Prisma, ActivityStatus, ActivityType, type Priority } from '../../generated/prisma/client';
import { resolveActivityDates, DependencyInput, PredecessorData } from '../../utils/dependencyScheduler';
import { autoAssignByRole } from '../../utils/roleMembershipResolver';
import { isFeatureEnabled, parseFeatureFlags } from '../../utils/featureFlags';
import prisma from '../../db';

export { Prisma, prisma, ActivityStatus, ActivityType };
export type { Priority };

export type ActivityExecutorUser = {
  user: { id: string; realName: string; username?: string | null };
};

export type ActivityWithExecutorUsers = {
  executors?: ActivityExecutorUser[];
};

export type ActivityWithRole = {
  role?: { name: string } | null;
};

export type ReorderItem = { id: string; sortOrder: number };
export type BatchActivityInput = {
  projectId: string;
  name: string;
  description?: string | null;
  type?: string;
  phase?: string | null;
  status?: string;
  priority?: string;
  planStartDate?: string | Date | null;
  planEndDate?: string | Date | null;
  planDuration?: number | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  duration?: number | null;
  dependencies?: unknown;
  notes?: string | null;
  sortOrder?: number;
  executorIds?: string[];
  assigneeIds?: string[];
};

export const isDependencyInput = (value: unknown): value is DependencyInput =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof (value as { id?: unknown }).id === 'string';

export const dependenciesFromJson = (value: unknown): DependencyInput[] =>
  Array.isArray(value) ? value.filter(isDependencyInput) : [];

export const executorUsers = (activity: ActivityWithExecutorUsers) =>
  activity.executors?.map((executor) => executor.user) ?? [];

export const queryString = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
};

export async function buildExecutorsForActivity(
  roleId: string | null | undefined,
  executorIds: string[] | undefined,
  currentUserId: string
) {
  if (executorIds && executorIds.length > 0) {
    const roleMemberIds = roleId ? await autoAssignByRole(roleId) : [];
    const roleMemberSet = new Set(roleMemberIds);
    return executorIds.map(uid => ({
      userId: uid,
      source: (roleId && roleMemberSet.has(uid)) ? 'ROLE_AUTO' as const : 'MANUAL_ADD' as const,
      snapshotRoleId: (roleId && roleMemberSet.has(uid)) ? roleId : null,
      assignedBy: currentUserId,
    }));
  }
  if (roleId && !executorIds) {
    const autoIds = await autoAssignByRole(roleId);
    return autoIds.map(uid => ({
      userId: uid,
      source: 'ROLE_AUTO' as const,
      snapshotRoleId: roleId,
      assignedBy: currentUserId,
    }));
  }
  return [];
}

export const EXECUTOR_INCLUDE = {
  executors: {
    include: {
      user: { select: { id: true, realName: true, canLogin: true } },
    },
    orderBy: [{ assignedAt: 'asc' }],
  },
  role: { select: { id: true, name: true } },
} satisfies Prisma.ActivityInclude;

export const ACTIVITY_LIST_INCLUDE = {
  ...EXECUTOR_INCLUDE,
  checkItems: {
    select: { id: true, checked: true, sortOrder: true },
    orderBy: { sortOrder: 'asc' },
  },
  _count: {
    select: { checkItems: true },
  },
} satisfies Prisma.ActivityInclude;

export async function computeDatesFromDeps(
  deps: DependencyInput[],
  selfDuration?: number | null
): Promise<{ planStartDate?: Date; planEndDate?: Date; planDuration?: number }> {
  if (!deps || deps.length === 0) return {};

  const predIds = deps.map((d) => d.id);
  const predActivities = await prisma.activity.findMany({
    where: { id: { in: predIds } },
    select: { id: true, planStartDate: true, planEndDate: true, planDuration: true },
  });

  const predecessors: PredecessorData[] = predActivities.map((a) => ({
    id: a.id,
    planStartDate: a.planStartDate,
    planEndDate: a.planEndDate,
    planDuration: a.planDuration,
  }));

  return resolveActivityDates(deps, predecessors, selfDuration);
}

export async function cascadeUpdateDependents(
  projectId: string,
  changedActivityId: string
): Promise<void> {
  const allActivities = await prisma.activity.findMany({
    where: { projectId },
    select: { id: true, dependencies: true },
  });

  const reverseDeps = new Map<string, string[]>();
  for (const a of allActivities) {
    for (const dep of dependenciesFromJson(a.dependencies)) {
      const list = reverseDeps.get(dep.id);
      if (list) list.push(a.id);
      else reverseDeps.set(dep.id, [a.id]);
    }
  }

  const visited = new Set<string>();
  const queue = [changedActivityId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const dependentIds = reverseDeps.get(currentId);
    if (!dependentIds) continue;

    for (const depId of dependentIds) {
      const depActivity = await prisma.activity.findUnique({
        where: { id: depId },
        select: { id: true, dependencies: true, planStartDate: true, planEndDate: true, planDuration: true },
      });
      if (!depActivity || !depActivity.dependencies) continue;

      const deps = dependenciesFromJson(depActivity.dependencies);
      const resolved = await computeDatesFromDeps(deps, depActivity.planDuration);

      if (!resolved.planStartDate && !resolved.planEndDate) continue;

      const startChanged = resolved.planStartDate &&
        (!depActivity.planStartDate || resolved.planStartDate.getTime() !== depActivity.planStartDate.getTime());
      const endChanged = resolved.planEndDate &&
        (!depActivity.planEndDate || resolved.planEndDate.getTime() !== depActivity.planEndDate.getTime());

      if (!startChanged && !endChanged) continue;

      const cascadeData: Prisma.ActivityUncheckedUpdateInput = {};
      if (resolved.planStartDate) cascadeData.planStartDate = resolved.planStartDate;
      if (resolved.planEndDate) cascadeData.planEndDate = resolved.planEndDate;
      if (resolved.planDuration !== undefined) cascadeData.planDuration = resolved.planDuration;

      await prisma.activity.update({
        where: { id: depId },
        data: cascadeData,
      });

      queue.push(depId);
    }
  }
}

export const requireFeatureFlag = (feature: string, message: string) =>
  (_req: Request, res: Response, next: NextFunction) => {
    if (!isFeatureEnabled(parseFeatureFlags(process.env.FEATURE_FLAGS), feature, true)) {
      res.status(503).json({
        error: 'FEATURE_DISABLED',
        feature,
        message,
      });
      return;
    }
    next();
  };
