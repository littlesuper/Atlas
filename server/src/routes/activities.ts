import express, { Request, Response } from 'express';
import { PrismaClient, ActivityType } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { requirePermission, canManageProject, sanitizePagination } from '../middleware/permission';
import { calculateWorkdays } from '../utils/workday';
import { updateProjectProgress } from '../utils/projectProgress';

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
      assignee: {
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
        assignee: {
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
        assignee: activity.assignee?.realName || '',
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
        assigneeId,
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

      // 验证负责人是否存在
      if (assigneeId) {
        const assignee = await prisma.user.findUnique({
          where: { id: assigneeId },
        });

        if (!assignee) {
          res.status(400).json({ error: '负责人不存在' });
          return;
        }
      }

      // 自动计算工期
      let finalPlanDuration = planDuration;
      let finalDuration = duration;

      if (planStartDate && planEndDate && !planDuration) {
        finalPlanDuration = calculateWorkdays(new Date(planStartDate), new Date(planEndDate));
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
          assigneeId: assigneeId || null,
          status,
          priority,
          planStartDate: planStartDate ? new Date(planStartDate) : null,
          planEndDate: planEndDate ? new Date(planEndDate) : null,
          planDuration: finalPlanDuration,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          duration: finalDuration,
          dependencies: dependencies || null,
          notes,
          sortOrder: sortOrder || 0,
        },
        include: {
          assignee: {
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

      res.status(201).json(activity);
    } catch (error) {
      console.error('创建活动错误:', error);
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
);

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
        assigneeId,
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

      // 验证负责人是否存在
      if (assigneeId) {
        const assignee = await prisma.user.findUnique({
          where: { id: assigneeId },
        });

        if (!assignee) {
          res.status(400).json({ error: '负责人不存在' });
          return;
        }
      }

      // 构建更新数据
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;
      if (phase !== undefined) updateData.phase = phase;
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId || null;
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

      // 更新活动
      const activity = await prisma.activity.update({
        where: { id },
        data: updateData,
        include: {
          assignee: {
            select: {
              id: true,
              realName: true,
              username: true,
            },
          },
        },
      });

      // 自动更新项目进度
      await updateProjectProgress(existingActivity.projectId);

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

export default router;
