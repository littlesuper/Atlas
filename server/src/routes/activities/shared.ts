import { NextFunction, Request, Response } from 'express';
import { Prisma, ActivityStatus, ActivityType, type Priority } from '../../generated/prisma/client';
import { resolveActivityDates, DependencyInput, PredecessorData } from '../../utils/dependencyScheduler';
import {
  computeProjectScheduleCascade,
  type ActivitySnapshot,
  type ActivitySnapshotType,
  type ProjectSnapshot,
} from '../../utils/scheduleEngine';
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

/**
 * 项目级活动日期级联：当 changedActivityId 的计划日期变化后，
 * 沿 reverse-dependencies 顺延更新所有下游活动。
 *
 * 实现：先把全项目活动构造成内存 snapshot，调用纯函数
 * computeProjectScheduleCascade（与对话式排期助手的干跑共用算法），
 * 然后在单个 transaction 里把变更批量写回，避免 N 次往返。
 */
export async function cascadeUpdateDependents(
  projectId: string,
  changedActivityId: string
): Promise<void> {
  const allActivities = await prisma.activity.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      type: true,
      dependencies: true,
      planStartDate: true,
      planEndDate: true,
      planDuration: true,
      hardConstraintDate: true,
    },
  });

  if (allActivities.length === 0) return;

  const snapshot: ProjectSnapshot = {
    projectId,
    projectEndDate: null,
    activities: allActivities.map(
      (a): ActivitySnapshot => ({
        id: a.id,
        name: a.name,
        type: a.type as ActivitySnapshotType,
        planStartDate: a.planStartDate,
        planEndDate: a.planEndDate,
        planDuration: a.planDuration,
        hardConstraintDate: a.hardConstraintDate,
        dependencies: dependenciesFromJson(a.dependencies),
      })
    ),
  };

  const { snapshot: nextSnapshot, changedIds } = computeProjectScheduleCascade(
    snapshot,
    [changedActivityId]
  );

  if (changedIds.size === 0) return;

  const nextById = new Map(nextSnapshot.activities.map((a) => [a.id, a]));

  await prisma.$transaction(
    Array.from(changedIds).map((id) => {
      const next = nextById.get(id);
      const data: Prisma.ActivityUncheckedUpdateInput = {};
      if (next?.planStartDate) data.planStartDate = next.planStartDate;
      if (next?.planEndDate) data.planEndDate = next.planEndDate;
      if (next?.planDuration !== undefined && next?.planDuration !== null) {
        data.planDuration = next.planDuration;
      }
      return prisma.activity.update({ where: { id }, data });
    })
  );
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
