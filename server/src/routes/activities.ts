import express, { Request, Response } from 'express';
import multer from 'multer';
import { PrismaClient, ActivityType } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, canManageProject, sanitizePagination } from '../middleware/permission';
import { calculateWorkdays } from '../utils/workday';
import { resolveActivityDates, DependencyInput, PredecessorData } from '../utils/dependencyScheduler';
import { updateProjectProgress } from '../utils/projectProgress';
import { auditLog, diffFields } from '../utils/auditLog';
import { callAi } from '../utils/aiClient';
import { parseExcelActivities } from '../utils/excelActivityParser';
import { pinyin } from 'pinyin-pro';

const router = express.Router();
const prisma = new PrismaClient();


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

    // 返回完整活动列表
    const activities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: includeAssignee,
    });

    res.json(activities);
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
        parent: '0',
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
 * POST /api/activities/batch-create
 * 批量创建活动（用于撤销删除）
 */
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
      items.map((item: any) => {
        const assigneeIds: string[] = Array.isArray(item.assigneeIds) ? item.assigneeIds : [];
        let planDuration = item.planDuration;
        if (!planDuration && item.planStartDate && item.planEndDate) {
          planDuration = calculateWorkdays(new Date(item.planStartDate), new Date(item.planEndDate));
        }
        return prisma.activity.create({
          data: {
            projectId: item.projectId,
            name: item.name,
            description: item.description || null,
            type: item.type || ActivityType.TASK,
            phase: item.phase || null,
            status: item.status || 'NOT_STARTED',
            priority: item.priority || 'MEDIUM',
            planStartDate: item.planStartDate ? new Date(item.planStartDate) : null,
            planEndDate: item.planEndDate ? new Date(item.planEndDate) : null,
            planDuration: planDuration || null,
            startDate: item.startDate ? new Date(item.startDate) : null,
            endDate: item.endDate ? new Date(item.endDate) : null,
            duration: item.duration || null,
            dependencies: item.dependencies || null,
            notes: item.notes || null,
            sortOrder: item.sortOrder || 0,
            assignees: assigneeIds.length > 0 ? { connect: assigneeIds.map((id: string) => ({ id })) } : undefined,
          },
          include: { assignees: { select: { id: true, realName: true, username: true } } },
        });
      })
    );

    await updateProjectProgress(projectId);
    res.status(201).json({ success: true, count: created.length });
  } catch (error) {
    console.error('批量创建活动错误:', error);
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
 * PUT /api/activities/batch-update
 * 批量更新活动（必须在 /:id 之前注册）
 */
router.put('/batch-update', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
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
 * DELETE /api/activities/batch-delete
 * 批量删除活动（必须在 /:id 之前注册，否则会被 /:id 捕获）
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

      await prisma.activity.delete({ where: { id } });

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
 * 资源负载看板：summary + members + issues
 */
router.get('/workload', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    const where: any = {};
    if (projectId) where.projectId = projectId as string;

    const activities = await prisma.activity.findMany({
      where,
      include: {
        assignees: { select: { id: true, realName: true, username: true } },
        project: { select: { id: true, name: true } },
      },
    });

    const now = new Date();

    // Aggregate by assignee
    const userMap = new Map<string, {
      userId: string; realName: string; username: string | null;
      totalActivities: number; inProgress: number; notStarted: number; overdue: number; totalDuration: number;
    }>();

    const overdueIssues: Array<{
      type: 'overdue'; activityId: string; activityName: string;
      projectId: string; projectName: string; assigneeNames: string[];
      planStartDate: string | null; planEndDate: string | null; overdueDays: number;
    }> = [];
    const overdueSet = new Set<string>();

    const unassignedIssues: Array<{
      type: 'unassigned'; activityId: string; activityName: string;
      projectId: string; projectName: string; assigneeNames: string[];
      planStartDate: string | null; planEndDate: string | null;
    }> = [];

    for (const a of activities) {
      const isActive = a.status !== 'COMPLETED' && a.status !== 'CANCELLED';
      const isOverdue = isActive && a.planEndDate && a.planEndDate < now;

      // Aggregate per assignee
      for (const u of a.assignees) {
        let entry = userMap.get(u.id);
        if (!entry) {
          entry = { userId: u.id, realName: u.realName, username: u.username, totalActivities: 0, inProgress: 0, notStarted: 0, overdue: 0, totalDuration: 0 };
          userMap.set(u.id, entry);
        }
        entry.totalActivities++;
        if (a.status === 'IN_PROGRESS') entry.inProgress++;
        if (a.status === 'NOT_STARTED') entry.notStarted++;
        if (isOverdue) entry.overdue++;
        entry.totalDuration += a.planDuration || 0;
      }

      // Overdue issues (deduplicated)
      if (isOverdue && !overdueSet.has(a.id)) {
        overdueSet.add(a.id);
        const diffMs = now.getTime() - new Date(a.planEndDate!).getTime();
        const overdueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        overdueIssues.push({
          type: 'overdue',
          activityId: a.id,
          activityName: a.name,
          projectId: a.project.id,
          projectName: a.project.name,
          assigneeNames: a.assignees.map((u: any) => u.realName),
          planStartDate: a.planStartDate ? a.planStartDate.toISOString() : null,
          planEndDate: a.planEndDate ? a.planEndDate.toISOString() : null,
          overdueDays,
        });
      }

      // Unassigned issues
      if (isActive && a.assignees.length === 0) {
        unassignedIssues.push({
          type: 'unassigned',
          activityId: a.id,
          activityName: a.name,
          projectId: a.project.id,
          projectName: a.project.name,
          assigneeNames: [],
          planStartDate: a.planStartDate ? a.planStartDate.toISOString() : null,
          planEndDate: a.planEndDate ? a.planEndDate.toISOString() : null,
        });
      }
    }

    const members = Array.from(userMap.values())
      .sort((a, b) => (b.inProgress + b.overdue) - (a.inProgress + a.overdue));

    // Sort issues: overdue (days desc) then unassigned (start date asc)
    overdueIssues.sort((a, b) => b.overdueDays - a.overdueDays);
    unassignedIssues.sort((a, b) => {
      const da = a.planStartDate ? new Date(a.planStartDate).getTime() : Infinity;
      const db = b.planStartDate ? new Date(b.planStartDate).getTime() : Infinity;
      return da - db;
    });

    const issues = [...overdueIssues, ...unassignedIssues];

    const summary = {
      totalOverdue: overdueSet.size,
      totalUnassigned: unassignedIssues.length,
      overloadedCount: members.filter(m => m.inProgress >= 5).length,
    };

    res.json({ summary, members, issues });
  } catch (error) {
    console.error('获取资源负载错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ======================== AI 排计划建议 ========================

/**
 * POST /api/activities/project/:projectId/ai-schedule
 * AI 辅助排计划：基于历史数据和项目类型，建议工期和风险
 * Body: { activities } — 当前活动列表（可选，不传则自动读取）
 */
router.post('/project/:projectId/ai-schedule', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, productLine: true },
    });
    if (!project) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }

    // 当前项目活动
    const currentActivities = await prisma.activity.findMany({
      where: { projectId },
      select: { id: true, name: true, type: true, phase: true, planDuration: true, status: true },
      orderBy: { sortOrder: 'asc' },
    });

    // 获取历史数据：同产品线已完成项目的活动实际工期
    const historicalProjects = await prisma.project.findMany({
      where: {
        status: 'COMPLETED',
        ...(project.productLine ? { productLine: project.productLine } : {}),
        id: { not: projectId },
      },
      select: { id: true, name: true },
      take: 10,
    });

    let historicalActivities: any[] = [];
    if (historicalProjects.length > 0) {
      historicalActivities = await prisma.activity.findMany({
        where: {
          projectId: { in: historicalProjects.map((p) => p.id) },
          status: 'COMPLETED',
          duration: { not: null },
        },
        select: { name: true, type: true, phase: true, planDuration: true, duration: true },
      });
    }

    // 构建提示
    const currentData = currentActivities.map((a) => ({
      name: a.name,
      type: a.type,
      phase: a.phase,
      currentPlanDuration: a.planDuration,
      status: a.status,
    }));

    const historyData = historicalActivities.map((a: any) => ({
      name: a.name,
      type: a.type,
      phase: a.phase,
      planDuration: a.planDuration,
      actualDuration: a.duration,
    }));

    const aiResult = await callAi({
      feature: 'schedule',
      projectId,
      systemPrompt: `你是一个硬件项目管理专家。请根据项目当前的活动列表和历史项目的实际工期数据，为每个活动建议合理的工期（工作日），并识别可能的风险。
返回 JSON 格式：
{
  "suggestions": [
    { "name": "活动名称", "suggestedDuration": 数字, "reason": "建议原因" }
  ],
  "risks": [
    { "activity": "活动名称", "risk": "风险描述", "severity": "HIGH/MEDIUM/LOW" }
  ],
  "summary": "总结建议"
}`,
      userPrompt: `项目：${project.name}（产品线：${project.productLine || '未指定'}）

当前活动列表：
${JSON.stringify(currentData, null, 2)}

历史项目实际工期数据（${historicalActivities.length} 条记录）：
${JSON.stringify(historyData, null, 2)}`,
    });

    if (aiResult?.content) {
      let jsonStr = aiResult.content;
      const fenced = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenced) jsonStr = fenced[1];
      try {
        const parsed = JSON.parse(jsonStr.trim());
        res.json(parsed);
        return;
      } catch { /* fall through to rule-based */ }
    }

    // 无 AI 时使用基于历史数据的规则引擎
    const suggestions = currentActivities.map((a) => {
      // 查找同名/同类型的历史活动实际工期
      const similar = historicalActivities.filter((h: any) =>
        h.name === a.name || (h.phase === a.phase && h.type === a.type)
      );
      if (similar.length > 0) {
        const avgDuration = Math.round(
          similar.reduce((sum: number, h: any) => sum + (h.duration || 0), 0) / similar.length
        );
        return {
          name: a.name,
          suggestedDuration: avgDuration,
          reason: `基于 ${similar.length} 个历史同类活动平均实际工期`,
        };
      }
      return null;
    }).filter(Boolean);

    const risks = currentActivities
      .filter((a) => a.status === 'IN_PROGRESS' && !a.planDuration)
      .map((a) => ({
        activity: a.name,
        risk: '未设定计划工期，无法评估进度偏差',
        severity: 'MEDIUM',
      }));

    res.json({
      suggestions,
      risks,
      summary: historicalActivities.length > 0
        ? `基于 ${historicalProjects.length} 个历史项目的 ${historicalActivities.length} 条活动数据生成建议`
        : '暂无历史数据，建议手动设定工期后积累数据',
    });
  } catch (error) {
    console.error('AI 排计划建议错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ======================== 资源冲突检测 ========================

/**
 * GET /api/activities/resource-conflicts
 * 检测资源分配冲突：同一人在同一时间段被分配到多个活动
 */
router.get('/resource-conflicts', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.query;

    // 查询所有进行中/未开始且有计划日期的活动
    const where: any = {
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      planStartDate: { not: null },
      planEndDate: { not: null },
      assignees: { some: {} },
    };
    if (projectId) where.projectId = projectId as string;

    const activities = await prisma.activity.findMany({
      where,
      select: {
        id: true,
        name: true,
        projectId: true,
        planStartDate: true,
        planEndDate: true,
        planDuration: true,
        assignees: { select: { id: true, realName: true, username: true } },
        project: { select: { id: true, name: true } },
      },
    });

    // 按人员分组，检测时间重叠
    const userActivities = new Map<string, typeof activities>();
    for (const a of activities) {
      for (const u of a.assignees) {
        if (!userActivities.has(u.id)) userActivities.set(u.id, []);
        userActivities.get(u.id)!.push(a);
      }
    }

    interface Conflict {
      userId: string;
      realName: string;
      activities: Array<{
        id: string;
        name: string;
        projectId: string;
        projectName: string;
        planStartDate: string;
        planEndDate: string;
      }>;
    }

    const conflicts: Conflict[] = [];

    for (const [userId, acts] of userActivities) {
      if (acts.length < 2) continue;

      // 排序后两两比较
      const sorted = acts.sort((a, b) =>
        new Date(a.planStartDate!).getTime() - new Date(b.planStartDate!).getTime()
      );

      const overlapping: typeof acts = [];
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) {
          const aEnd = new Date(sorted[i].planEndDate!).getTime();
          const bStart = new Date(sorted[j].planStartDate!).getTime();
          if (bStart <= aEnd) {
            if (!overlapping.includes(sorted[i])) overlapping.push(sorted[i]);
            if (!overlapping.includes(sorted[j])) overlapping.push(sorted[j]);
          }
        }
      }

      if (overlapping.length >= 2) {
        const user = overlapping[0].assignees.find((u) => u.id === userId)!;
        conflicts.push({
          userId,
          realName: user.realName,
          activities: overlapping.map((a) => ({
            id: a.id,
            name: a.name,
            projectId: a.projectId,
            projectName: a.project.name,
            planStartDate: a.planStartDate!.toISOString(),
            planEndDate: a.planEndDate!.toISOString(),
          })),
        });
      }
    }

    res.json(conflicts);
  } catch (error) {
    console.error('资源冲突检测错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ======================== What-if 模拟 ========================

/**
 * POST /api/activities/project/:projectId/what-if
 * 模拟某个任务延期或提前 N 天，返回对整体计划的影响（不保存）
 * Body: { activityId, delayDays } — delayDays 为正数表示延期，负数表示提前
 */
router.post('/project/:projectId/what-if', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { activityId, delayDays } = req.body;

    if (!activityId || delayDays === undefined || delayDays === 0) {
      res.status(400).json({ error: '活动ID和偏移天数不能为空，且天数不能为0' });
      return;
    }

    // 加载项目所有活动
    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      select: {
        id: true, name: true, dependencies: true,
        planStartDate: true, planEndDate: true, planDuration: true,
      },
    });

    // 用内存副本模拟
    const actMap = new Map(allActivities.map((a) => [a.id, { ...a }]));
    const target = actMap.get(activityId);
    if (!target) {
      res.status(404).json({ error: '活动不存在' });
      return;
    }

    // 模拟延期/提前（delayDays 为正延期、为负提前）
    const { offsetWorkdays: owFn } = await import('../utils/workday');
    if (target.planStartDate) {
      target.planStartDate = owFn(target.planStartDate, delayDays);
    }
    if (target.planEndDate) {
      target.planEndDate = owFn(target.planEndDate, delayDays);
    }

    // 构建反向依赖图并 BFS 级联
    const reverseDeps = new Map<string, string[]>();
    for (const a of allActivities) {
      if (!a.dependencies || !Array.isArray(a.dependencies)) continue;
      for (const dep of a.dependencies as any[]) {
        const list = reverseDeps.get(dep.id);
        if (list) list.push(a.id);
        else reverseDeps.set(dep.id, [a.id]);
      }
    }

    const affected: Array<{
      id: string; name: string;
      originalStart: string | null; originalEnd: string | null;
      newStart: string | null; newEnd: string | null;
    }> = [{
      id: target.id,
      name: target.name,
      originalStart: allActivities.find((a) => a.id === activityId)!.planStartDate?.toISOString() || null,
      originalEnd: allActivities.find((a) => a.id === activityId)!.planEndDate?.toISOString() || null,
      newStart: target.planStartDate?.toISOString() || null,
      newEnd: target.planEndDate?.toISOString() || null,
    }];

    const visited = new Set<string>();
    const queue = [activityId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const dependentIds = reverseDeps.get(currentId) || [];
      for (const depId of dependentIds) {
        const depAct = actMap.get(depId);
        if (!depAct || !depAct.dependencies) continue;

        const deps = depAct.dependencies as unknown as DependencyInput[];
        const predecessors: PredecessorData[] = deps.map((d) => {
          const pred = actMap.get(d.id);
          return {
            id: d.id,
            planStartDate: pred?.planStartDate || null,
            planEndDate: pred?.planEndDate || null,
            planDuration: pred?.planDuration || null,
          };
        });

        const resolved = resolveActivityDates(deps, predecessors, depAct.planDuration);
        const originalAct = allActivities.find((a) => a.id === depId)!;

        const startChanged = resolved.planStartDate &&
          (!depAct.planStartDate || resolved.planStartDate.getTime() !== depAct.planStartDate.getTime());
        const endChanged = resolved.planEndDate &&
          (!depAct.planEndDate || resolved.planEndDate.getTime() !== depAct.planEndDate.getTime());

        if (startChanged || endChanged) {
          if (resolved.planStartDate) depAct.planStartDate = resolved.planStartDate;
          if (resolved.planEndDate) depAct.planEndDate = resolved.planEndDate;
          if (resolved.planDuration !== undefined) depAct.planDuration = resolved.planDuration;

          affected.push({
            id: depAct.id,
            name: depAct.name,
            originalStart: originalAct.planStartDate?.toISOString() || null,
            originalEnd: originalAct.planEndDate?.toISOString() || null,
            newStart: depAct.planStartDate?.toISOString() || null,
            newEnd: depAct.planEndDate?.toISOString() || null,
          });

          queue.push(depId);
        }
      }
    }

    // 计算对项目结束日期的影响
    let maxOriginalEnd: Date | null = null;
    let maxNewEnd: Date | null = null;
    for (const a of actMap.values()) {
      if (a.planEndDate) {
        if (!maxNewEnd || a.planEndDate > maxNewEnd) maxNewEnd = a.planEndDate;
      }
    }
    for (const a of allActivities) {
      if (a.planEndDate) {
        if (!maxOriginalEnd || a.planEndDate > maxOriginalEnd) maxOriginalEnd = a.planEndDate;
      }
    }

    res.json({
      affectedCount: affected.length,
      affected,
      projectEndDateBefore: maxOriginalEnd?.toISOString() || null,
      projectEndDateAfter: maxNewEnd?.toISOString() || null,
    });
  } catch (error) {
    console.error('What-if 模拟错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/activities/project/:projectId/what-if/apply
 * 将 What-If 模拟结果应用到实际数据：先归档快照，再批量更新活动日期
 * Body: { affected: [{id, newStart, newEnd}], archiveLabel? }
 */
router.post('/project/:projectId/what-if/apply', authenticate, requirePermission('activity', 'update'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { affected, archiveLabel } = req.body;

    if (!Array.isArray(affected) || affected.length === 0) {
      res.status(400).json({ error: '受影响活动列表不能为空' });
      return;
    }

    // 权限检查
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) { res.status(404).json({ error: '项目不存在' }); return; }
    if (!canManageProject(req, project.managerId, projectId)) {
      res.status(403).json({ error: '无权操作' }); return;
    }

    // Step 1: 创建归档快照
    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      orderBy: { sortOrder: 'asc' },
      include: { assignees: { select: { id: true, realName: true, username: true } } },
    });

    await prisma.activityArchive.create({
      data: {
        projectId,
        label: archiveLabel || 'What-If 模拟应用前快照',
        snapshot: allActivities as any,
      },
    });

    // Step 2: 批量更新受影响活动的计划日期
    const { calculateWorkdays: calcWd } = await import('../utils/workday');
    let updatedCount = 0;
    for (const item of affected) {
      const { id, newStart, newEnd } = item;
      if (!id) continue;

      const updateData: any = {};
      if (newStart) updateData.planStartDate = new Date(newStart);
      if (newEnd) updateData.planEndDate = new Date(newEnd);
      if (newStart && newEnd) {
        updateData.planDuration = calcWd(new Date(newStart), new Date(newEnd));
      }

      await prisma.activity.update({ where: { id }, data: updateData });
      updatedCount++;
    }

    // Step 3: 更新项目进度
    await updateProjectProgress(projectId);

    // Step 4: 写审计日志
    await auditLog({
      action: 'UPDATE',
      resourceType: 'ACTIVITY',
      resourceId: projectId,
      resourceName: `What-If 模拟应用 (${updatedCount} 个活动)`,
      req,
    });

    res.json({ success: true, updatedCount });
  } catch (error) {
    console.error('应用 What-If 模拟结果错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ======================== 一键重排 ========================

/**
 * POST /api/activities/project/:projectId/reschedule
 * 基于当前实际进度重排后续计划
 * Body: { baseDate? } — 默认 today
 */
router.post('/project/:projectId/reschedule', authenticate, async (req: Request, res: Response): Promise<void> => {
  try {
    const { projectId } = req.params;
    const { baseDate } = req.body;
    const { offsetWorkdays: owFn } = await import('../utils/workday');

    const base = baseDate ? new Date(baseDate) : new Date();

    // 获取所有活动
    const allActivities = await prisma.activity.findMany({
      where: { projectId },
      select: {
        id: true, name: true, status: true, dependencies: true,
        planStartDate: true, planEndDate: true, planDuration: true,
        startDate: true, endDate: true, duration: true,
      },
    });

    // 分类：已完成的保持不动，未完成的重排
    const completed = allActivities.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED');
    const incomplete = allActivities.filter((a) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED');

    if (incomplete.length === 0) {
      res.json({ success: true, updatedCount: 0 });
      return;
    }

    // 构建模拟 map
    const actMap = new Map(allActivities.map((a) => [a.id, { ...a }]));

    // 拓扑排序处理：先无依赖的，再有依赖的
    const pending = new Set(incomplete.map((a) => a.id));
    let maxIter = incomplete.length + 1;
    const updatedIds: string[] = [];

    while (pending.size > 0 && maxIter-- > 0) {
      for (const a of incomplete) {
        if (!pending.has(a.id)) continue;

        const deps = (a.dependencies as DependencyInput[] | null) || [];
        // 所有依赖要么已完成要么已排好
        const allDepsReady = deps.every((d) => !pending.has(d.id));
        if (!allDepsReady) continue;

        const entry = actMap.get(a.id)!;
        const duration = a.planDuration || 1;

        if (deps.length === 0) {
          // 无依赖：从 baseDate 开始
          const pStart = owFn(base, 0);
          const pEnd = owFn(pStart, duration - 1);
          entry.planStartDate = pStart;
          entry.planEndDate = pEnd;
          entry.planDuration = duration;
        } else {
          const predecessors: PredecessorData[] = deps.map((d) => {
            const pred = actMap.get(d.id);
            return {
              id: d.id,
              planStartDate: pred?.planStartDate || pred?.endDate || null,
              planEndDate: pred?.planEndDate || pred?.endDate || null,
              planDuration: pred?.planDuration || null,
            };
          });
          const resolved = resolveActivityDates(deps, predecessors, duration);
          if (resolved.planStartDate) entry.planStartDate = resolved.planStartDate;
          if (resolved.planEndDate) entry.planEndDate = resolved.planEndDate;
          if (resolved.planDuration !== undefined) entry.planDuration = resolved.planDuration;
        }

        updatedIds.push(a.id);
        pending.delete(a.id);
      }
    }

    // 批量更新
    await prisma.$transaction(
      updatedIds.map((id) => {
        const entry = actMap.get(id)!;
        return prisma.activity.update({
          where: { id },
          data: {
            planStartDate: entry.planStartDate,
            planEndDate: entry.planEndDate,
            planDuration: entry.planDuration,
          },
        });
      })
    );

    res.json({ success: true, updatedCount: updatedIds.length });
  } catch (error) {
    console.error('一键重排错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

/**
 * POST /api/activities/project/:projectId/import-excel
 * 从 Excel 文件导入活动
 */
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase();
    if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 .xlsx / .xls 文件'));
    }
  },
});

router.post(
  '/project/:projectId/import-excel',
  authenticate,
  requirePermission('activity', 'create'),
  excelUpload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;

      // 验证项目存在
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }

      // 权限检查
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '无权在此项目中导入活动' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: '请上传 Excel 文件' });
        return;
      }

      // 解析 Excel
      const parsed = parseExcelActivities(req.file.buffer);
      if (parsed.length === 0) {
        res.json({ success: true, count: 0, skipped: 0, createdUsers: [], activities: [] });
        return;
      }

      // 收集所有负责人姓名
      const allNames = new Set<string>();
      parsed.forEach((a) => a.assigneeNames.forEach((n) => allNames.add(n)));

      // 查询已有用户（按 realName 匹配）
      const existingUsers = allNames.size > 0
        ? await prisma.user.findMany({
            where: { realName: { in: Array.from(allNames) } },
            select: { id: true, realName: true },
          })
        : [];
      const userMap = new Map<string, string>(); // realName → userId
      existingUsers.forEach((u) => userMap.set(u.realName, u.id));

      // 自动创建不存在的联系人（用户名由姓名拼音生成，重复时追加数字）
      const createdUsers: string[] = [];
      for (const name of allNames) {
        if (!userMap.has(name)) {
          const baseUsername = pinyin(name, { toneType: 'none', type: 'array' }).join('');
          let username = baseUsername;
          let suffix = 1;
          while (await prisma.user.findUnique({ where: { username } })) {
            username = baseUsername + suffix;
            suffix++;
          }
          const newUser = await prisma.user.create({
            data: { realName: name, username, canLogin: false },
          });
          userMap.set(name, newUser.id);
          createdUsers.push(name);
        }
      }

      // 查询项目现有活动，用于去重（按 名称+阶段+计划日期 匹配）
      const dateStr = (d: Date | null | undefined) => d ? d.toISOString().slice(0, 10) : '';
      const existingActivities = await prisma.activity.findMany({
        where: { projectId },
        select: { name: true, phase: true, planStartDate: true, planEndDate: true },
      });
      const existingSet = new Set(
        existingActivities.map((a) =>
          `${a.name}|${a.phase || ''}|${dateStr(a.planStartDate)}|${dateStr(a.planEndDate)}`
        )
      );

      // 过滤掉与现有活动重复的行
      const toCreate = parsed.filter((a) => {
        const key = `${a.name}|${a.phase || ''}|${dateStr(a.planStartDate)}|${dateStr(a.planEndDate)}`;
        return !existingSet.has(key);
      });
      const skipped = parsed.length - toCreate.length;

      if (toCreate.length === 0) {
        res.json({ success: true, count: 0, skipped, createdUsers, activities: [] });
        return;
      }

      // 获取当前最大 sortOrder
      const maxSort = await prisma.activity.aggregate({
        where: { projectId },
        _max: { sortOrder: true },
      });
      let sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

      // 批量创建活动
      const activities = await prisma.$transaction(
        toCreate.map((a) => {
          const assigneeIds = a.assigneeNames
            .map((n) => userMap.get(n))
            .filter((id): id is string => !!id);

          const data: any = {
            projectId,
            name: a.name,
            type: ActivityType.TASK,
            phase: a.phase || null,
            status: a.status || 'NOT_STARTED',
            planStartDate: a.planStartDate || null,
            planEndDate: a.planEndDate || null,
            planDuration: a.planDuration || null,
            notes: a.notes || null,
            sortOrder: sortOrder++,
          };

          // 自动计算工期
          if (!data.planDuration && data.planStartDate && data.planEndDate) {
            data.planDuration = calculateWorkdays(data.planStartDate, data.planEndDate);
          }

          if (assigneeIds.length > 0) {
            data.assignees = { connect: assigneeIds.map((id) => ({ id })) };
          }

          return prisma.activity.create({
            data,
            include: {
              assignees: { select: { id: true, realName: true, username: true } },
            },
          });
        })
      );

      // 更新项目进度
      await updateProjectProgress(projectId);

      auditLog({
        req,
        action: 'CREATE',
        resourceType: 'activity',
        resourceId: projectId,
        resourceName: `批量导入 ${activities.length} 条活动`,
      });

      res.json({
        success: true,
        count: activities.length,
        skipped,
        createdUsers,
        activities,
      });
    } catch (error: any) {
      console.error('导入 Excel 活动错误:', error?.message, error?.stack);
      res.status(500).json({ error: error?.message || '服务器内部错误' });
    }
  }
);

/**
 * POST /api/activities/project/:projectId/undo-import
 * 撤销批量导入的活动
 */
router.post(
  '/project/:projectId/undo-import',
  authenticate,
  requirePermission('activity', 'create'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectId } = req.params;
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: '无可撤销的活动' });
        return;
      }

      const project = await prisma.project.findUnique({ where: { id: projectId } });
      if (!project) {
        res.status(404).json({ error: '项目不存在' });
        return;
      }
      if (!canManageProject(req, project.managerId, projectId)) {
        res.status(403).json({ error: '无权操作' });
        return;
      }

      // 仅删除属于该项目的活动
      await prisma.activity.deleteMany({
        where: { id: { in: ids }, projectId },
      });

      await updateProjectProgress(projectId);

      res.json({ success: true, count: ids.length });
    } catch (error) {
      console.error('撤销导入错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

export default router;
