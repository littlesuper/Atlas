import express, { Request, Response } from 'express';
import { PrismaClient, ActivityType } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, canManageProject, sanitizePagination } from '../middleware/permission';
import { calculateWorkdays } from '../utils/workday';
import { resolveActivityDates, DependencyInput, PredecessorData } from '../utils/dependencyScheduler';
import { updateProjectProgress } from '../utils/projectProgress';
import { auditLog, diffFields } from '../utils/auditLog';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * 构建活动树形结构
 */
function buildActivityTree(activities: any[]): any[] {
  const activityMap = new Map();
  const rootActivities: any[] = [];

  // 初始化map
  activities.forEach((activity) => {
    activityMap.set(activity.id, { ...activity, children: [] });
  });

  // 构建树形结构
  activities.forEach((activity) => {
    const node = activityMap.get(activity.id);
    if (activity.parentId) {
      const parent = activityMap.get(activity.parentId);
      if (parent) {
        parent.children.push(node);
      }
    } else {
      rootActivities.push(node);
    }
  });

  return rootActivities;
}

/**
 * 查询前置活动并调用调度器计算日期
 */
async function computeDatesFromDeps(
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
 * 级联更新下游依赖任务的日期
 * 当前置活动日期变更后，BFS 遍历所有下游任务重新计算日期
 */
async function cascadeUpdateDependents(
  projectId: string,
  changedActivityId: string
): Promise<void> {
  // 一次性查询所有活动，构建反向依赖图：predecessorId → dependentId[]
  const allActivities = await prisma.activity.findMany({
    where: { projectId },
    select: { id: true, dependencies: true },
  });

  const reverseDeps = new Map<string, string[]>();
  for (const a of allActivities) {
    if (!a.dependencies || !Array.isArray(a.dependencies)) continue;
    for (const dep of a.dependencies as any[]) {
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
      // 每次取最新数据（前面的级联可能已更新了它的前置活动）
      const depActivity = await prisma.activity.findUnique({
        where: { id: depId },
        select: { id: true, dependencies: true, planStartDate: true, planEndDate: true, planDuration: true },
      });
      if (!depActivity || !depActivity.dependencies) continue;

      const deps = depActivity.dependencies as unknown as DependencyInput[];
      const resolved = await computeDatesFromDeps(deps, depActivity.planDuration);

      if (!resolved.planStartDate && !resolved.planEndDate) continue;

      // 检查日期是否真的变了
      const startChanged = resolved.planStartDate &&
        (!depActivity.planStartDate || resolved.planStartDate.getTime() !== depActivity.planStartDate.getTime());
      const endChanged = resolved.planEndDate &&
        (!depActivity.planEndDate || resolved.planEndDate.getTime() !== depActivity.planEndDate.getTime());

      if (!startChanged && !endChanged) continue;

      const cascadeData: any = {};
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

/**
 * GET /api/activities/project/:projectId
 * 获取项目活动
 *
 * 支持两种模式：
 * 1. 分页模式：传入 page/pageSize 参数，返回 { data, total, page, pageSize } 格式的扁平列表
 * 2. 树形模式（默认/向后兼容）：不传分页参数，返回树形结构数组
 */
router.get('/project/:projectId', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { page, pageSize } = req.query;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    const includeAssignee = {
      assignees: {
        select: {
          id: true,
          realName: true,
          username: true,
        },
      },
    };

    // 分页模式：当请求携带 page 或 pageSize 参数时返回扁平分页结果
    if (page !== undefined || pageSize !== undefined) {
      const { pageNum, pageSizeNum } = sanitizePagination(page, pageSize);
      const skip = (pageNum - 1) * pageSizeNum;

      const [activities, total] = await Promise.all([
        prisma.activity.findMany({
          where: { projectId },
          orderBy: { sortOrder: 'asc' },
          skip,
          take: pageSizeNum,
          include: includeAssignee,
        }),
        prisma.activity.count({ where: { projectId } }),
      ]);

      res.json({ data: activities, total, page: pageNum, pageSize: pageSizeNum });
      return;
    }

    // 树形模式（向后兼容）：返回完整树形结构
    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: includeAssignee,
    });

    const tree = buildActivityTree(activities);

    res.json(tree);
  } catch (error) {
    console.error('获取活动列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/activities/project/:projectId/gantt
 * 获取甘特图数据
 */
router.get('/project/:projectId/gantt', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 获取所有活动
    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: {
        assignees: {
          select: {
            id: true,
            realName: true,
            username: true,
          },
        },
      },
    });

    // 转换为甘特图格式
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
        parent: activity.parentId || '0',
        type,
        assignee: (activity as any).assignees?.map((u: any) => u.realName).join(', ') || '',
        status: activity.status,
        priority: activity.priority,
      };
    });

    // 构建依赖关系
    const links: any[] = [];
    activities.forEach((activity) => {
      if (activity.dependencies && Array.isArray(activity.dependencies)) {
        (activity.dependencies as any[]).forEach((dep: any) => {
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
    console.error('获取甘特图数据错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/activities
 * 创建活动
 * 权限：activity:create
 */
router.post(
  '/',
  authenticate,
  requirePermission('activity', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        projectId,
        parentId,
        name,
        description,
        type,
        phase,
        assigneeIds,
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

      // 验证项目是否存在
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      });

      if (!project) {
        res.status(400).json({ error: '项目不存在' });
        return;
      }

      // 项目归属检查：管理员、项目经理或协作者可以创建活动
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '只能在自己负责的项目中创建活动' });
        return;
      }

      // 验证父活动是否存在且属于同一项目
      if (parentId) {
        const parentActivity = await prisma.activity.findUnique({
          where: { id: parentId },
        });

        if (!parentActivity) {
          res.status(400).json({ error: '父活动不存在' });
          return;
        }

        if (parentActivity.projectId !== projectId) {
          res.status(400).json({ error: '父活动不属于该项目' });
          return;
        }
      }

      // 解析负责人列表
      const resolvedAssigneeIds: string[] = Array.isArray(assigneeIds) ? assigneeIds : [];

      // 根据依赖关系自动计算计划日期
      let resolvedPlanStart = planStartDate ? new Date(planStartDate) : null;
      let resolvedPlanEnd = planEndDate ? new Date(planEndDate) : null;
      let resolvedPlanDuration = planDuration;

      if (dependencies && Array.isArray(dependencies) && dependencies.length > 0) {
        const resolved = await computeDatesFromDeps(dependencies, planDuration);
        if (resolved.planStartDate) resolvedPlanStart = resolved.planStartDate;
        if (resolved.planEndDate) resolvedPlanEnd = resolved.planEndDate;
        if (resolved.planDuration !== undefined) resolvedPlanDuration = resolved.planDuration;
      }

      // 自动计算工期
      let finalPlanDuration = resolvedPlanDuration;
      let finalDuration = duration;

      if (resolvedPlanStart && resolvedPlanEnd && !finalPlanDuration) {
        finalPlanDuration = calculateWorkdays(resolvedPlanStart, resolvedPlanEnd);
      }

      if (startDate && endDate && !duration) {
        finalDuration = calculateWorkdays(new Date(startDate), new Date(endDate));
      }

      // 创建活动
      const activity = await prisma.activity.create({
        data: {
          projectId,
          parentId: parentId || null,
          name,
          description,
          type: type || ActivityType.TASK,
          phase,
          assignees: resolvedAssigneeIds.length > 0 ? { connect: resolvedAssigneeIds.map((uid: string) => ({ id: uid })) } : undefined,
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
        include: {
          assignees: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      // 自动更新项目进度
      await updateProjectProgress(projectId);

      auditLog({ req, action: 'CREATE', resourceType: 'activity', resourceId: activity.id, resourceName: activity.name });

      res.status(201).json(activity);
    } catch (error) {
      console.error('创建活动错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * POST /api/activities/project/:projectId/archives
 * 创建归档快照
 */
router.post('/project/:projectId/archives', authenticate, requirePermission('activity', 'create'), async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(404).json({ error: '项目不存在' }); return; }
    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: {
        assignees: { select: { id: true, realName: true, username: true } },
      },
    });

    const { label } = req.body || {};

    const archive = await prisma.activityArchive.create({
      data: { projectId, label: label || null, snapshot: activities as any },
    });

    res.status(201).json({ id: archive.id, label: archive.label, createdAt: archive.createdAt, count: activities.length });
  } catch (error) {
    console.error('创建归档错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/activities/project/:projectId/archives
 * 获取项目归档列表（不含 snapshot）
 */
router.get('/project/:projectId/archives', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.projectId as string;

    const archives = await prisma.activityArchive.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, createdAt: true, snapshot: true },
    });

    const result = archives.map(a => ({
      id: a.id,
      label: a.label,
      createdAt: a.createdAt,
      count: Array.isArray(a.snapshot) ? (a.snapshot as any[]).length : 0,
    }));

    res.json(result);
  } catch (error) {
    console.error('获取归档列表错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/activities/archives/:id
 * 获取归档详情（含 snapshot）
 */
router.get('/archives/:id', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const archiveId = req.params.id as string;
    const archive = await prisma.activityArchive.findUnique({ where: { id: archiveId } });
    if (!archive) { res.status(404).json({ error: '归档不存在' }); return; }
    res.json(archive);
  } catch (error) {
    console.error('获取归档详情错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/activities/archives/:id
 * 删除归档
 */
router.delete('/archives/:id', authenticate, requirePermission('activity', 'delete'), async (req: Request, res: Response): Promise<void> => {
  try {
    const archiveId = req.params.id as string;
    const archive = await prisma.activityArchive.findUnique({ where: { id: archiveId } });
    if (!archive) { res.status(404).json({ error: '归档不存在' }); return; }
    await prisma.activityArchive.delete({ where: { id: archiveId } });
    res.json({ success: true });
  } catch (error) {
    console.error('删除归档错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/activities/:id
 * 更新活动
 * 权限：activity:update
 */
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
        assigneeIds,
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

      // 检查活动是否存在
      const existingActivity = await prisma.activity.findUnique({
        where: { id },
      });

      if (!existingActivity) {
        res.status(404).json({ error: '活动不存在' });
        return;
      }

      // 项目归属检查：管理员、项目经理或协作者可以修改活动
      const actProject = await prisma.project.findUnique({
        where: { id: existingActivity.projectId },
        select: { managerId: true },
      });
      if (!canManageProject(req, actProject?.managerId ?? '', existingActivity.projectId)) {
        res.status(403).json({ error: '只能修改自己负责的项目中的活动' });
        return;
      }

      // 构建更新数据
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (phase !== undefined) updateData.phase = phase;

      // 处理负责人多选
      if (assigneeIds !== undefined) {
        const ids: string[] = Array.isArray(assigneeIds) ? assigneeIds : [];
        updateData.assignees = { set: ids.map((uid: string) => ({ id: uid })) };
      }
      if (status !== undefined) updateData.status = status;
      if (priority !== undefined) updateData.priority = priority;
      if (dependencies !== undefined) updateData.dependencies = dependencies;
      if (notes !== undefined) updateData.notes = notes;
      if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

      // 处理计划时间和工期
      if (planStartDate !== undefined) {
        updateData.planStartDate = planStartDate ? new Date(planStartDate) : null;
      }
      if (planEndDate !== undefined) {
        updateData.planEndDate = planEndDate ? new Date(planEndDate) : null;
      }
      if (planDuration !== undefined) {
        updateData.planDuration = planDuration;
      }

      // 根据依赖关系自动计算计划日期（当 dependencies 被更新时）
      if (dependencies !== undefined && Array.isArray(dependencies) && dependencies.length > 0) {
        const selfDuration = planDuration ?? existingActivity.planDuration;
        const resolved = await computeDatesFromDeps(dependencies, selfDuration);
        if (resolved.planStartDate) updateData.planStartDate = resolved.planStartDate;
        if (resolved.planEndDate) updateData.planEndDate = resolved.planEndDate;
        if (resolved.planDuration !== undefined) updateData.planDuration = resolved.planDuration;
      }

      // 自动计算计划工期
      if (
        updateData.planStartDate &&
        updateData.planEndDate &&
        updateData.planDuration === undefined
      ) {
        updateData.planDuration = calculateWorkdays(
          updateData.planStartDate,
          updateData.planEndDate
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

      // 处理实际时间和工期
      if (startDate !== undefined) {
        updateData.startDate = startDate ? new Date(startDate) : null;
      }
      if (endDate !== undefined) {
        updateData.endDate = endDate ? new Date(endDate) : null;
      }
      if (duration !== undefined) {
        updateData.duration = duration;
      }

      // 自动计算实际工期
      if (
        updateData.startDate &&
        updateData.endDate &&
        updateData.duration === undefined
      ) {
        updateData.duration = calculateWorkdays(
          updateData.startDate,
          updateData.endDate
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

      // 记录原始日期用于判断是否需要级联
      const oldPlanStart = existingActivity.planStartDate?.getTime();
      const oldPlanEnd = existingActivity.planEndDate?.getTime();

      // 更新活动
      const activity = await prisma.activity.update({
        where: { id },
        data: updateData,
        include: {
          assignees: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      // 级联更新下游依赖任务（当计划日期发生变更时）
      const newPlanStart = activity.planStartDate?.getTime();
      const newPlanEnd = activity.planEndDate?.getTime();
      if (oldPlanStart !== newPlanStart || oldPlanEnd !== newPlanEnd) {
        await cascadeUpdateDependents(existingActivity.projectId, id);
      }

      // 自动更新项目进度
      await updateProjectProgress(existingActivity.projectId);

      const changes = diffFields(existingActivity as any, activity as any, ['name', 'status', 'type', 'phase', 'planStartDate', 'planEndDate', 'startDate', 'endDate']);
      auditLog({ req, action: 'UPDATE', resourceType: 'activity', resourceId: activity.id, resourceName: activity.name, changes });

      res.json(activity);
    } catch (error) {
      console.error('更新活动错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * DELETE /api/activities/:id
 * 删除活动
 * 权限：activity:delete
 */
router.delete(
  '/:id',
  authenticate,
  requirePermission('activity', 'delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      // 检查活动是否存在
      const existingActivity = await prisma.activity.findUnique({
        where: { id },
      });

      if (!existingActivity) {
        res.status(404).json({ error: '活动不存在' });
        return;
      }

      // 项目归属检查：管理员、项目经理或协作者可以删除活动
      const delProject = await prisma.project.findUnique({
        where: { id: existingActivity.projectId },
        select: { managerId: true },
      });
      if (!canManageProject(req, delProject?.managerId ?? '', existingActivity.projectId)) {
        res.status(403).json({ error: '只能删除自己负责的项目中的活动' });
        return;
      }

      const projectId = existingActivity.projectId;

      // 删除活动（级联删除子活动）
      await prisma.activity.delete({
        where: { id },
      });

      // 自动更新项目进度
      await updateProjectProgress(projectId);

      auditLog({ req, action: 'DELETE', resourceType: 'activity', resourceId: id, resourceName: existingActivity.name });

      res.json({ success: true });
    } catch (error) {
      console.error('删除活动错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

/**
 * PUT /api/activities/project/:projectId/reorder
 * 批量排序
 */
router.put('/project/:projectId/reorder', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { items } = req.body;

    // 检查项目是否存在
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 项目归属检查：管理员、项目经理或协作者可以排序活动
    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '只能对自己负责的项目中的活动排序' });
      return;
    }

    if (!items || !Array.isArray(items)) {
      res.status(400).json({ error: '无效的排序数据' });
      return;
    }

    // 批量更新排序
    await Promise.all(
      items.map((item: any) =>
        prisma.activity.update({
          where: { id: item.id },
          data: {
            sortOrder: item.sortOrder,
            parentId: item.parentId || null,
          },
        })
      )
    );

    res.json({ success: true });
  } catch (error) {
    console.error('批量排序错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/activities/archives/compare
 * 对比两个归档（或归档 vs 当前活动）
 */
router.post('/archives/compare', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { archiveId1, archiveId2, projectId } = req.body;
    if (!archiveId1 || !projectId) {
      res.status(400).json({ error: '参数不完整' }); return;
    }

    // 获取归档1
    const archive1 = await prisma.activityArchive.findUnique({ where: { id: archiveId1 } });
    if (!archive1) { res.status(404).json({ error: '归档1不存在' }); return; }
    const snap1 = Array.isArray(archive1.snapshot) ? archive1.snapshot as any[] : [];

    // 获取归档2或当前活动
    let snap2: any[];
    if (archiveId2 === 'current') {
      const currentActivities = await prisma.activity.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        include: { assignees: { select: { id: true, realName: true } } },
      });
      snap2 = currentActivities;
    } else {
      const archive2 = await prisma.activityArchive.findUnique({ where: { id: archiveId2 } });
      if (!archive2) { res.status(404).json({ error: '归档2不存在' }); return; }
      snap2 = Array.isArray(archive2.snapshot) ? archive2.snapshot as any[] : [];
    }

    // 按活动名称匹配计算差异
    const map1 = new Map(snap1.map((a: any) => [a.name, a]));
    const map2 = new Map(snap2.map((a: any) => [a.name, a]));

    const diffs: any[] = [];

    // 检查 snap2 中的活动
    for (const [name, a2] of map2) {
      const a1 = map1.get(name);
      if (!a1) {
        diffs.push({ name, type: 'added', current: a2 });
      } else {
        // 比较关键字段
        const changes: string[] = [];
        if (a1.status !== a2.status) changes.push('status');
        if (a1.phase !== a2.phase) changes.push('phase');
        if (JSON.stringify(a1.planStartDate) !== JSON.stringify(a2.planStartDate)) changes.push('planStartDate');
        if (JSON.stringify(a1.planEndDate) !== JSON.stringify(a2.planEndDate)) changes.push('planEndDate');
        if (a1.planDuration !== a2.planDuration) changes.push('planDuration');
        if (changes.length > 0) {
          diffs.push({ name, type: 'changed', changes, before: a1, current: a2 });
        } else {
          diffs.push({ name, type: 'unchanged' });
        }
      }
    }

    // 检查 snap1 中已删除的活动
    for (const [name, a1] of map1) {
      if (!map2.has(name)) {
        diffs.push({ name, type: 'deleted', before: a1 });
      }
    }

    res.json({ diffs });
  } catch (error) {
    console.error('对比归档错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * PUT /api/activities/batch-update
 * 批量更新活动
 */
router.put('/batch-update', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { ids, updates } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: '请选择活动' }); return;
    }

    // 验证所有活动属于同一项目
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
      const updateData: any = {};
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.phase !== undefined) updateData.phase = updates.phase;
      if (updates.assigneeIds !== undefined) {
        updateData.assignees = { set: updates.assigneeIds.map((uid: string) => ({ id: uid })) };
      }
      await prisma.activity.update({ where: { id: actId }, data: updateData });
    }

    await updateProjectProgress(projectId);
    res.json({ success: true, count: ids.length });
  } catch (error) {
    console.error('批量更新错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * DELETE /api/activities/batch-delete
 * 批量删除活动
 */
router.delete('/batch-delete', authenticate, requirePermission('activity', 'delete'), async (req: Request, res: Response): Promise<void> => {
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
    console.error('批量删除错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/activities/project/:projectId/critical-path
 * 计算关键路径
 */
router.get('/project/:projectId/critical-path', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const activities = await prisma.activity.findMany({
      where: { projectId },
      select: { id: true, planStartDate: true, planEndDate: true, planDuration: true, dependencies: true },
    });

    if (activities.length === 0) {
      res.json({ criticalActivityIds: [] }); return;
    }

    // Build dependency graph
    const actMap = new Map(activities.map(a => [a.id, a]));
    const successors = new Map<string, string[]>();
    const predecessors = new Map<string, string[]>();

    for (const a of activities) {
      if (!a.dependencies || !Array.isArray(a.dependencies)) continue;
      for (const dep of a.dependencies as any[]) {
        if (!actMap.has(dep.id)) continue;
        const succ = successors.get(dep.id);
        if (succ) succ.push(a.id);
        else successors.set(dep.id, [a.id]);
        const pred = predecessors.get(a.id);
        if (pred) pred.push(dep.id);
        else predecessors.set(a.id, [dep.id]);
      }
    }

    // Forward pass: Early Start (ES) and Early Finish (EF)
    const es = new Map<string, number>();
    const ef = new Map<string, number>();
    const duration = new Map<string, number>();

    for (const a of activities) {
      duration.set(a.id, a.planDuration || 1);
    }

    // Topological sort
    const inDegree = new Map<string, number>();
    for (const a of activities) {
      inDegree.set(a.id, (predecessors.get(a.id) || []).length);
    }
    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const topoOrder: string[] = [];
    while (queue.length > 0) {
      const id = queue.shift()!;
      topoOrder.push(id);
      for (const succId of (successors.get(id) || [])) {
        const newDeg = (inDegree.get(succId) || 1) - 1;
        inDegree.set(succId, newDeg);
        if (newDeg === 0) queue.push(succId);
      }
    }

    // Forward pass
    for (const id of topoOrder) {
      const preds = predecessors.get(id) || [];
      const earlyStart = preds.length > 0 ? Math.max(...preds.map(p => ef.get(p) || 0)) : 0;
      es.set(id, earlyStart);
      ef.set(id, earlyStart + (duration.get(id) || 1));
    }

    // Backward pass: Late Start (LS) and Late Finish (LF)
    const projectEnd = Math.max(...activities.map(a => ef.get(a.id) || 0));
    const ls = new Map<string, number>();
    const lf = new Map<string, number>();

    for (const id of topoOrder.slice().reverse()) {
      const succs = successors.get(id) || [];
      const lateFinish = succs.length > 0 ? Math.min(...succs.map(s => ls.get(s) || projectEnd)) : projectEnd;
      lf.set(id, lateFinish);
      ls.set(id, lateFinish - (duration.get(id) || 1));
    }

    // Critical path: float = 0
    const criticalActivityIds = activities
      .filter(a => {
        const float = (ls.get(a.id) || 0) - (es.get(a.id) || 0);
        return float === 0;
      })
      .map(a => a.id);

    res.json({ criticalActivityIds });
  } catch (error) {
    console.error('计算关键路径错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * GET /api/activities/workload
 * 资源负载统计
 */
router.get('/workload', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) where.projectId = projectId;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        assignees: { select: { id: true, realName: true, username: true } },
      },
    });

    // Aggregate by assignee
    const userMap = new Map<string, {
      userId: string; realName: string; username: string;
      totalActivities: number; inProgress: number; overdue: number; totalDuration: number;
    }>();

    const now = new Date();
    for (const a of activities) {
      for (const u of a.assignees) {
        let entry = userMap.get(u.id);
        if (!entry) {
          entry = { userId: u.id, realName: u.realName, username: u.username, totalActivities: 0, inProgress: 0, overdue: 0, totalDuration: 0 };
          userMap.set(u.id, entry);
        }
        entry.totalActivities++;
        if (a.status === 'IN_PROGRESS') entry.inProgress++;
        if (a.planEndDate && a.planEndDate < now && a.status !== 'COMPLETED' && a.status !== 'CANCELLED') {
          entry.overdue++;
        }
        entry.totalDuration += a.planDuration || 0;
      }
    }

    res.json(Array.from(userMap.values()));
  } catch (error) {
    console.error('获取资源负载错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
