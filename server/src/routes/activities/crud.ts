import express, { Request, Response } from 'express';
import { authenticate } from '../../middleware/auth';
import { requirePermission, canManageProject, sanitizePagination } from '../../middleware/permission';
import { calculateWorkdays } from '../../utils/workday';
import { detectCircularDependency } from '../../utils/dependencyValidator';
import { updateProjectProgress } from '../../utils/projectProgress';
import { auditLog, diffFields } from '../../utils/auditLog';
import { autoAssignByRole } from '../../utils/roleMembershipResolver';
import { logger } from '../../utils/logger';
import {
  Prisma,
  prisma,
  ActivityStatus,
  ActivityType,
  type Priority,
  EXECUTOR_INCLUDE,
  ACTIVITY_LIST_INCLUDE,
  dependenciesFromJson,
  executorUsers,
  computeDatesFromDeps,
  cascadeUpdateDependents,
  requireFeatureFlag,
  type BatchActivityInput,
  type ReorderItem,
  buildExecutorsForActivity,
} from './shared';

const router = express.Router();

router.get('/project/:projectId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { page, pageSize } = req.query;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    if (page !== undefined || pageSize !== undefined) {
      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      const [activities, total] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId },
          orderBy: { sortOrder: 'asc' },
          skip,
          take: pageSizeNum,
          include: ACTIVITY_LIST_INCLUDE,
        }),
        prisma.activity.count({ where: { projectId } }),
      ]);

      res.json({ data: activities, total, page: pageNum, pageSize: pageSizeNum });
      return;
    }

    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: ACTIVITY_LIST_INCLUDE,
    });

    res.json(activities);
  } catch (error) {
    logger.error({ err: error }, '获取活动列表错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.get('/project/:projectId/gantt', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: {
        executors: {
          include: {
            user: { select: { id: true, realName: true } },
          },
        },
      },
    });

    const tasks = activities.map((activity) => {
      let type = 'task';
      if (activity.type === ActivityType.MILESTONE) {
        type = 'milestone';
      } else if (activity.type === ActivityType.PHASE) {
        type = 'project';
      }

      return {
        id: activity.id,
        text: activity.name,
        plan_start_date: activity.planStartDate,
        plan_end_date: activity.planEndDate,
        plan_duration: activity.planDuration,
        start_date: activity.startDate,
        end_date: activity.endDate,
        duration: activity.duration,
        parent: '0',
        type,
        assignee: executorUsers(activity).map((user) => user.realName).join(', ') || '',
        status: activity.status,
        priority: activity.priority,
      };
    });

    const links: Array<{ id: string; source: string; target: string; type: string }> = [];
    activities.forEach((activity) => {
      const deps = dependenciesFromJson(activity.dependencies);
      if (deps.length > 0) {
        deps.forEach((dep) => {
          links.push({
            id: `${dep.id}-${activity.id}`,
            source: dep.id,
            target: activity.id,
            type: dep.type || '0',
          });
        });
      }
    });

    res.json({ tasks, links });
  } catch (error) {
    logger.error({ err: error }, '获取甘特图数据错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post('/batch-create', authenticate, requirePermission('activity', 'create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { activities: items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: '请提供活动数据' }); return;
    }

    const projectId = items[0].projectId;
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(404).json({ error: '项目不存在' }); return; }
    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    const created = await prisma.$transaction(
      (items as BatchActivityInput[]).map((item) => {
        const effectiveExecutorIds: string[] = Array.isArray(item.executorIds)
          ? item.executorIds
          : Array.isArray(item.assigneeIds)
            ? item.assigneeIds
            : [];
        let planDuration = item.planDuration;
        if (!planDuration && item.planStartDate && item.planEndDate) {
          planDuration = calculateWorkdays(new Date(item.planStartDate), new Date(item.planEndDate));
        }
        return prisma.activity.create({
          data: {
            projectId: item.projectId,
            name: item.name,
            description: item.description || null,
            type: (item.type as ActivityType | undefined) || ActivityType.TASK,
            phase: item.phase || null,
            status: (item.status as ActivityStatus | undefined) || ActivityStatus.NOT_STARTED,
            priority: (item.priority as Priority | undefined) || 'MEDIUM',
            planStartDate: item.planStartDate ? new Date(item.planStartDate) : null,
            planEndDate: item.planEndDate ? new Date(item.planEndDate) : null,
            planDuration: planDuration || null,
            startDate: item.startDate ? new Date(item.startDate) : null,
            endDate: item.endDate ? new Date(item.endDate) : null,
            duration: item.duration || null,
            dependencies: item.dependencies ? item.dependencies as Prisma.InputJsonValue : undefined,
            notes: item.notes || null,
            sortOrder: item.sortOrder || 0,
            executors: effectiveExecutorIds.length > 0
              ? {
                  create: effectiveExecutorIds.map((uid: string) => ({
                    userId: uid,
                    source: 'MANUAL_ADD' as const,
                    assignedBy: req.user?.id,
                  })),
                }
              : undefined,
          },
          include: EXECUTOR_INCLUDE,
        });
      })
    );

    await updateProjectProgress(projectId);
    res.status(201).json({ success: true, count: created.length });
  } catch (error) {
    logger.error({ err: error }, '批量创建活动错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

router.post(
  '/',
  authenticate,
  requirePermission('activity', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectId,
        name,
        description,
        type,
        phase,
        roleId,
        executorIds,
        status,
        priority,
        planStartDate,
        planEndDate,
        planDuration,
        startDate,
        endDate,
        duration,
        dependencies,
        notes,
        sortOrder,
      } = req.body;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (project && project.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }

      if (!project) {
        res.status(400).json({ error: '项目不存在' });
        return;
      }

      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '只能在自己负责的项目中创建活动' });
        return;
      }

      if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
        const hasCycle = await detectCircularDependency(projectId, '', dependencies, prisma);
        if (hasCycle) {
          res.status(400).json({ error: '存在循环依赖，无法保存' });
          return;
        }
      }

      let resolvedPlanStart = planStartDate ? new Date(planStartDate) : null;
      let resolvedPlanEnd = planEndDate ? new Date(planEndDate) : null;
      let resolvedPlanDuration = planDuration;

      if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
        const resolved = await computeDatesFromDeps(dependencies, planDuration);
        if (resolved.planStartDate) resolvedPlanStart = resolved.planStartDate;
        if (resolved.planEndDate) resolvedPlanEnd = resolved.planEndDate;
        if (resolved.planDuration !== undefined) resolvedPlanDuration = resolved.planDuration;
      }

      let finalPlanDuration = resolvedPlanDuration;
      let finalDuration = duration;

      if (resolvedPlanStart && resolvedPlanEnd && !finalPlanDuration) {
        finalPlanDuration = calculateWorkdays(resolvedPlanStart, resolvedPlanEnd);
      }

      if (startDate && endDate && !duration) {
        finalDuration = calculateWorkdays(new Date(startDate), new Date(endDate));
      }

      const currentUserId = req.user?.id || '';
      const executorData = await buildExecutorsForActivity(roleId, executorIds, currentUserId);

      const activity = await prisma.activity.create({
        data: {
          projectId,
          name,
          description,
          type: type || ActivityType.TASK,
          phase,
          roleId: roleId ?? null,
          executors: {
            create: executorData,
          },
          status: status || 'NOT_STARTED',
          priority,
          planStartDate: resolvedPlanStart,
          planEndDate: resolvedPlanEnd,
          planDuration: finalPlanDuration,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          duration: finalDuration,
          dependencies: dependencies || null,
          notes,
          sortOrder: sortOrder || 0,
        },
        include: EXECUTOR_INCLUDE,
      });

      await updateProjectProgress(projectId);

      auditLog({ req, action: 'CREATE', resourceType: 'activity', resourceId: activity.id, resourceName: activity.name });

      res.status(201).json(activity);
    } catch (error) {
      logger.error({ err: error }, '创建活动错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);


router.put('/batch-update',
  authenticate,
  requirePermission('activity', 'update'),
  requireFeatureFlag('activity.bulk-mutation', '活动批量变更功能已临时关闭'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, updates } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请选择活动' }); return;
    }

    const activities = await prisma.activity.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true },
    });
    const projectIds = [...new Set(activities.map(a => a.projectId))];
    if (projectIds.length !== 1) {
      res.status(400).json({ error: '批量操作仅支持同一项目的活动' }); return;
    }

    const projectId = projectIds[0];
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
    if (!canManageProject(req, project?.managerId ?? '', projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    for (const actId of ids) {
      const updateData: Prisma.ActivityUpdateArgs['data'] = {};
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.phase !== undefined) updateData.phase = updates.phase;
      if (updates.assigneeIds !== undefined) {
        const ids: string[] = Array.isArray(updates.assigneeIds) ? updates.assigneeIds : [];
        await prisma.activityExecutor.deleteMany({ where: { activityId: actId } });
        if (ids.length > 0) {
          updateData.executors = {
            create: ids.map((uid: string) => ({
              userId: uid,
              source: 'MANUAL_ADD' as const,
              assignedBy: req.user?.id,
            })),
          };
        }
      }
      await prisma.activity.update({ where: { id: actId }, data: updateData });
    }

    await updateProjectProgress(projectId);
    res.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error({ err: error }, '批量更新错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
  }
);

router.put(
  '/:id',
  authenticate,
  requirePermission('activity', 'update'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        name,
        description,
        type,
        phase,
        roleId,
        executorIds,
        resetExecutorsByRole,
        status,
        priority,
        planStartDate,
        planEndDate,
        planDuration,
        startDate,
        endDate,
        duration,
        dependencies,
        notes,
        sortOrder,
      } = req.body;

      const existingActivity = await prisma.activity.findUnique({
        where: { id },
      });

      if (!existingActivity) {
        res.status(404).json({ error: '活动不存在' });
        return;
      }

      const actProject = await prisma.project.findUnique({
        where: { id: existingActivity.projectId },
        select: { managerId: true, status: true },
      });
      if (actProject?.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }
      if (!canManageProject(req, actProject?.managerId ?? '', existingActivity.projectId)) {
        res.status(403).json({ error: '只能修改自己负责的项目中的活动' });
        return;
      }

      const updateData: Prisma.ActivityUpdateArgs['data'] = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (phase !== undefined) updateData.phase = phase;

      if (roleId !== undefined) updateData.roleId = roleId;

      const currentUserId = req.user?.id || '';
      const shouldResetExecutors = resetExecutorsByRole === true;
      const effectiveRoleId = roleId !== undefined ? roleId : existingActivity.roleId;
      const roleChanged = roleId !== undefined && roleId !== existingActivity.roleId;

      if (shouldResetExecutors && effectiveRoleId) {
        const autoIds = await autoAssignByRole(effectiveRoleId);
        await prisma.activityExecutor.deleteMany({ where: { activityId: id } });
        updateData.executors = {
          create: autoIds.map(uid => ({
            userId: uid,
            source: 'ROLE_AUTO',
            snapshotRoleId: effectiveRoleId,
            assignedBy: currentUserId,
          })),
        };
      } else if (executorIds !== undefined) {
        let existingExecutorUserIds = new Set<string>();
        if (roleChanged) {
          const existingExecutors = await prisma.activityExecutor.findMany({
            where: { activityId: id },
            select: { userId: true },
          });
          existingExecutorUserIds = new Set(existingExecutors.map(e => e.userId));
        }

        const roleMemberIds = effectiveRoleId ? await autoAssignByRole(effectiveRoleId) : [];
        const roleMemberSet = new Set(roleMemberIds);

        const executorData = executorIds.map((uid: string) => {
          if (roleChanged && existingExecutorUserIds.has(uid) && !roleMemberSet.has(uid)) {
            return {
              userId: uid,
              source: 'MANUAL_KEEP' as const,
              snapshotRoleId: effectiveRoleId || null,
              assignedBy: currentUserId,
            };
          }
          return {
            userId: uid,
            source: (effectiveRoleId && roleMemberSet.has(uid)) ? 'ROLE_AUTO' as const : 'MANUAL_ADD' as const,
            snapshotRoleId: (effectiveRoleId && roleMemberSet.has(uid)) ? effectiveRoleId : null,
            assignedBy: currentUserId,
          };
        });

        await prisma.activityExecutor.deleteMany({ where: { activityId: id } });
        updateData.executors = {
          create: executorData,
        };
      }
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (dependencies !== undefined && Array.isArray(dependencies) && dependencies.length > 0) {
        const hasCycle = await detectCircularDependency(existingActivity.projectId, id, dependencies, prisma);
        if (hasCycle) {
          res.status(400).json({ error: '存在循环依赖，无法保存' });
          return;
        }
      }
      if (dependencies !== undefined) updateData.dependencies = dependencies;
      if (notes !== undefined) updateData.notes = notes;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      if (planStartDate !== undefined) {
        updateData.planStartDate = planStartDate ? new Date(planStartDate) : null;
      }
      if (planEndDate !== undefined) {
        updateData.planEndDate = planEndDate ? new Date(planEndDate) : null;
      }
      if (planDuration !== undefined) {
        updateData.planDuration = planDuration;
      }

      if (dependencies !== undefined && Array.isArray(dependencies) && dependencies.length > 0) {
        const selfDuration = planDuration ?? existingActivity.planDuration;
        const resolved = await computeDatesFromDeps(dependencies, selfDuration);
        if (resolved.planStartDate) updateData.planStartDate = resolved.planStartDate;
        if (resolved.planEndDate) updateData.planEndDate = resolved.planEndDate;
        if (resolved.planDuration !== undefined) updateData.planDuration = resolved.planDuration;
      }

      const nextPlanStart = updateData.planStartDate instanceof Date ? updateData.planStartDate : undefined;
      const nextPlanEnd = updateData.planEndDate instanceof Date ? updateData.planEndDate : undefined;
      if (
        nextPlanStart &&
        nextPlanEnd &&
        updateData.planDuration === undefined
      ) {
        updateData.planDuration = calculateWorkdays(
          nextPlanStart,
          nextPlanEnd
        );
      } else if (
        planStartDate !== undefined &&
        planEndDate !== undefined &&
        planDuration === undefined
      ) {
        const start = planStartDate ? new Date(planStartDate) : existingActivity.planStartDate;
        const end = planEndDate ? new Date(planEndDate) : existingActivity.planEndDate;
        if (start && end) {
          updateData.planDuration = calculateWorkdays(start, end);
        }
      }

      if (startDate !== undefined) {
        updateData.startDate = startDate ? new Date(startDate) : null;
      }
      if (endDate !== undefined) {
        updateData.endDate = endDate ? new Date(endDate) : null;
      }
      if (duration !== undefined) {
        updateData.duration = duration;
      }

      const nextActualStart = updateData.startDate instanceof Date ? updateData.startDate : undefined;
      const nextActualEnd = updateData.endDate instanceof Date ? updateData.endDate : undefined;
      if (
        nextActualStart &&
        nextActualEnd &&
        updateData.duration === undefined
      ) {
        updateData.duration = calculateWorkdays(
          nextActualStart,
          nextActualEnd
        );
      } else if (
        startDate !== undefined &&
        endDate !== undefined &&
        duration === undefined
      ) {
        const start = startDate ? new Date(startDate) : existingActivity.startDate;
        const end = endDate ? new Date(endDate) : existingActivity.endDate;
        if (start && end) {
          updateData.duration = calculateWorkdays(start, end);
        }
      }

      const oldPlanStart = existingActivity.planStartDate?.getTime();
      const oldPlanEnd = existingActivity.planEndDate?.getTime();

      const activity = await prisma.activity.update({
        where: { id },
        data: updateData,
        include: EXECUTOR_INCLUDE,
      });

      const newPlanStart = activity.planStartDate?.getTime();
      const newPlanEnd = activity.planEndDate?.getTime();
      if (oldPlanStart !== newPlanStart || oldPlanEnd !== newPlanEnd) {
        await cascadeUpdateDependents(existingActivity.projectId, id);
      }

      await updateProjectProgress(existingActivity.projectId);

      const changes = diffFields(existingActivity as unknown as Record<string, unknown>, activity as unknown as Record<string, unknown>, ['name', 'status', 'type', 'phase', 'planStartDate', 'planEndDate', 'startDate', 'endDate']);
      auditLog({ req, action: 'UPDATE', resourceType: 'activity', resourceId: activity.id, resourceName: activity.name, changes });

      res.json(activity);
    } catch (error) {
      logger.error({ err: error }, '更新活动错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.delete('/batch-delete',
  authenticate,
  requirePermission('activity', 'delete'),
  requireFeatureFlag('activity.bulk-mutation', '活动批量变更功能已临时关闭'),
  async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请选择活动' }); return;
    }

    const activities = await prisma.activity.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true },
    });
    const projectIds = [...new Set(activities.map(a => a.projectId))];
    if (projectIds.length !== 1) {
      res.status(400).json({ error: '批量操作仅支持同一项目的活动' }); return;
    }

    const projectId = projectIds[0];
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
    if (!canManageProject(req, project?.managerId ?? '', projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    await prisma.activity.deleteMany({ where: { id: { in: ids } } });
    await updateProjectProgress(projectId);
    res.json({ success: true, count: ids.length });
  } catch (error) {
    logger.error({ err: error }, '批量删除错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
  }
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('activity', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const existingActivity = await prisma.activity.findUnique({
        where: { id },
      });

      if (!existingActivity) {
        res.status(404).json({ error: '活动不存在' });
        return;
      }

      const delProject = await prisma.project.findUnique({
        where: { id: existingActivity.projectId },
        select: { managerId: true, status: true },
      });
      if (delProject?.status === 'ARCHIVED') {
        res.status(403).json({ error: '归档项目不可修改' });
        return;
      }
      if (!canManageProject(req, delProject?.managerId ?? '', existingActivity.projectId)) {
        res.status(403).json({ error: '只能删除自己负责的项目中的活动' });
        return;
      }

      const projectId = existingActivity.projectId;

      await prisma.activity.delete({ where: { id } });

      await updateProjectProgress(projectId);

      auditLog({ req, action: 'DELETE', resourceType: 'activity', resourceId: id, resourceName: existingActivity.name });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, '删除活动错误');
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

router.put('/project/:projectId/reorder', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { items } = req.body;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '只能对自己负责的项目中的活动排序' });
      return;
    }

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: '无效的排序数据' });
      return;
    }

    await Promise.all(
      (items as ReorderItem[]).map((item) =>
        prisma.activity.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
          },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, '批量排序错误');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export { router as crudRouter };
